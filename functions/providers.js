'use strict';

const NAMES = ['mailjet', 'smtp2go', 'resend', 'brevo', 'emailjs'];
const result = (status, code, extra = {}) => ({status, code, ...extra});
const rejected = (code, extra) => result('rejected', code, extra);

class EmailProvider {
  constructor(name, config = {}, transport = fetch) {
    this.name = name;
    this.config = config;
    this.transport = transport;
  }
  getStatus() {
    const c = this.config;
    const configured = this.name === 'emailjs'
      ? !!(c.serviceId && c.templateId && c.publicKey && c.privateKey)
      : this.name === 'mailjet' ? !!(c.apiKey && c.secretKey && c.from) : !!(c.apiKey && c.from);
    return {name:this.name, configured, health:'not_checked', quota:{kind:'unknown', remaining:null}};
  }
  async healthCheck() { return this.getStatus(); } // Configuration inspection does not send email.
  async send() { throw new Error('Not implemented'); }
  async request(url, headers, body, parse) {
    if (!this.getStatus().configured) return rejected('not_configured', {circuit:'manual'});
    try {
      // No SDK retry layer: one invocation means at most one HTTP submission.
      const response = await this.transport(url, {method:'POST', headers:{'Content-Type':'application/json', ...headers},
        body:JSON.stringify(body), redirect:'error', signal:AbortSignal.timeout(15000)});
      const raw = await response.text();
      let data; try { data = JSON.parse(raw); } catch { data = null; }
      if (response.ok) return parse(data, raw);
      // A generic gateway 503 is not proof that the upstream did not accept mail.
      if (response.status >= 500 || response.status < 400) return result('unknown', 'ambiguous_http');
      const code = data?.name || data?.code;
      if (this.name === 'mailjet' && data?.ErrorCode === 'mj-0001') return result('failed', 'account_suspended');
      if (this.name === 'brevo' && code === 'not_enough_credits') return rejected('quota_exceeded', {circuit:'manual'});
      if (this.name === 'resend' && ['daily_quota_exceeded', 'monthly_quota_exceeded'].includes(code))
        return rejected('quota_exceeded', {circuit:'manual'});
      if (response.status === 429) {
        const delay = response.headers.get('retry-after');
        const seconds = /^\d+$/.test(delay || '') ? Number(delay) : (Date.parse(delay) - Date.now()) / 1000;
        return rejected('rate_limited', {cooldownMs:Math.max(60000, Math.min(86400000, Number.isFinite(seconds) ? seconds * 1000 : 60000))});
      }
      if (response.status === 401) return rejected('authentication', {circuit:'manual'});
      if (this.name === 'emailjs' && response.status === 403 && /monthly request quota exceeded/i.test(raw))
        return rejected('quota_exceeded', {circuit:'manual'});
      // A suspended/abuse-restricted account must not be bypassed through another ESP.
      if (response.status === 403) return result('failed', 'permission_or_policy_rejected');
      if ([400, 404, 422].includes(response.status)) return result('failed', 'invalid_request');
      return result('unknown', 'unclassified_response');
    } catch {
      // Includes timeout, reset, redirect and unreadable response body. Never log raw errors/tokens.
      return result('unknown', 'transport_uncertain');
    }
  }
}

class ResendProvider extends EmailProvider {
  constructor(c, t) { super('resend', c, t); }
  send(m) {
    return this.request('https://api.resend.com/emails', {Authorization:'Bearer ' + this.config.apiKey, 'Idempotency-Key':m.id},
      {from:this.config.from, to:[m.to], subject:m.subject, html:m.html, text:m.text}, d =>
        typeof d?.id === 'string' ? result('accepted', 'accepted', {providerMessageId:d.id}) : result('unknown', 'missing_receipt'));
  }
}
class BrevoProvider extends EmailProvider {
  constructor(c, t) { super('brevo', c, t); }
  send(m) {
    return this.request('https://api.brevo.com/v3/smtp/email', {'api-key':this.config.apiKey},
      {sender:{email:this.config.from, name:'GAIA'}, to:[{email:m.to, name:m.toName}], subject:m.subject,
        htmlContent:m.html, textContent:m.text, headers:{idempotencyKey:m.id}}, d =>
        typeof d?.messageId === 'string' ? result('accepted', 'accepted', {providerMessageId:d.messageId}) : result('unknown', 'missing_receipt'));
  }
}
class SMTP2GOProvider extends EmailProvider {
  constructor(c, t) { super('smtp2go', c, t); }
  send(m) {
    return this.request('https://api.smtp2go.com/v3/email/send', {'X-Smtp2go-Api-Key':this.config.apiKey},
      {sender:this.config.from, to:[m.to], subject:m.subject, html_body:m.html, text_body:m.text}, d =>
        d?.data?.succeeded === 1 && d.data.failed === 0 && typeof d.data.email_id === 'string'
          ? result('accepted', 'accepted', {providerMessageId:d.data.email_id}) : result('unknown', 'ambiguous_receipt'));
  }
}
class MailjetProvider extends EmailProvider {
  constructor(c, t) { super('mailjet', c, t); }
  send(m) {
    const auth = Buffer.from(this.config.apiKey + ':' + this.config.secretKey).toString('base64');
    return this.request('https://api.mailjet.com/v3.1/send', {Authorization:'Basic ' + auth},
      {Messages:[{From:{Email:this.config.from, Name:'GAIA'}, To:[{Email:m.to, Name:m.toName}],
        Subject:m.subject, HTMLPart:m.html, TextPart:m.text, CustomID:m.id}]}, d => {
        const receipt = d?.Messages?.[0];
        if (receipt?.Status === 'success' && receipt.To?.[0]?.MessageID)
          return result('accepted', 'accepted', {providerMessageId:String(receipt.To[0].MessageID)});
        // HTTP 200 without success cannot be treated as accepted or safely retried.
        return result('unknown', 'ambiguous_receipt');
      });
  }
}
class EmailJSProvider extends EmailProvider {
  constructor(c, t) { super('emailjs', c, t); }
  send(m) {
    const c = this.config;
    return this.request('https://api.emailjs.com/api/v1.0/email/send', {},
      {service_id:c.serviceId, template_id:c.templateId, user_id:c.publicKey, accessToken:c.privateKey,
        template_params:{to_email:m.to, to_name:m.toName, notice_title:m.subject, notice_body:m.text,
          notice_type:m.category, portal_name:'Portal Gaia · UFTM'}}, (d, raw) =>
        raw.trim() === 'OK' ? result('accepted', 'accepted', {providerMessageId:null}) : result('unknown', 'ambiguous_receipt'));
  }
}
function createProviders(credentials, transport) {
  return Object.fromEntries([MailjetProvider, SMTP2GOProvider, ResendProvider, BrevoProvider, EmailJSProvider]
    .map(Type => { const name = new Type().name; return [name, new Type(credentials[name], transport)]; }));
}
module.exports = {NAMES, EmailProvider, ResendProvider, BrevoProvider, SMTP2GOProvider, MailjetProvider, EmailJSProvider, createProviders};

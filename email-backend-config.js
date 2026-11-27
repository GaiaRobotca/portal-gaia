/* Public deployment switch. Contains no credentials. Enable only after the backend migration checklist. */
window.GAIA_EMAIL_BACKEND = Object.freeze({enabled:false, transport:'cloudflare', endpoint:'', region:'us-central1'});

const CONSENT_KEY = "oa_consent_recording";
const SURVEY_KEY = "oa_survey_opt_in";

function $(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function initStart() {
  const consent = $("#consent");
  const startBtn = $("#btn-start");

  const storedConsent = localStorage.getItem(CONSENT_KEY) === "true";
  if (storedConsent) consent.checked = true;

  function updateButton() {
    startBtn.disabled = !consent.checked;
  }

  function persist() {
    localStorage.setItem(CONSENT_KEY, String(consent.checked));
    // Always set survey opt-in to true since we removed the option to skip
    localStorage.setItem(SURVEY_KEY, "true");
  }

  consent.addEventListener("change", () => {
    persist();
    updateButton();
  });

  function goToOA() {
    const params = new URLSearchParams(window.location.search);
    const oa = params.get("oa");
    window.location.href = oa ? `oa.html?oa=${encodeURIComponent(oa)}` : "oa.html";
  }

  startBtn.addEventListener("click", () => {
    persist();
    goToOA();
  });

  // Initialize button state
  updateButton();
}

document.addEventListener("DOMContentLoaded", initStart);

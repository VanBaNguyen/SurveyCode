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
  const surveyYes = $("#survey-yes");
  const surveyNo = $("#survey-no");
  const skipModal = $("#skip-modal");
  const skipCancel = $("#btn-skip-cancel");
  const skipConfirm = $("#btn-skip-confirm");
  const skipClose = $("#btn-skip-x");

  const storedConsent = localStorage.getItem(CONSENT_KEY) === "true";
  if (storedConsent) consent.checked = true;

  const storedSurvey = localStorage.getItem(SURVEY_KEY);
  if (storedSurvey === "false") {
    surveyNo.checked = true;
  } else {
    surveyYes.checked = true;
  }

  function syncButton() {
    startBtn.disabled = !consent.checked;
  }

  function persist() {
    localStorage.setItem(CONSENT_KEY, String(consent.checked));
    localStorage.setItem(SURVEY_KEY, String(surveyYes.checked));
  }

  consent.addEventListener("change", () => {
    persist();
    syncButton();
  });

  surveyYes.addEventListener("change", persist);
  surveyNo.addEventListener("change", persist);

  function goToOA() {
    const params = new URLSearchParams(window.location.search);
    const oa = params.get("oa");
    window.location.href = oa ? `oa.html?oa=${encodeURIComponent(oa)}` : "oa.html";
  }

  function openModal() {
    skipModal.hidden = false;
    skipCancel.focus();
  }

  function closeModal() {
    skipModal.hidden = true;
  }

  skipCancel.addEventListener("click", () => {
    closeModal();
  });

  skipClose.addEventListener("click", () => {
    closeModal();
  });

  skipConfirm.addEventListener("click", () => {
    closeModal();
    goToOA();
  });

  skipModal.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.getAttribute && target.getAttribute("data-close") === "1") {
      closeModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && skipModal.hidden === false) {
      closeModal();
    }
  });

  startBtn.addEventListener("click", () => {
    persist();
    if (surveyNo.checked) {
      openModal();
      return;
    }
    goToOA();
  });

  syncButton();
}

document.addEventListener("DOMContentLoaded", initStart);

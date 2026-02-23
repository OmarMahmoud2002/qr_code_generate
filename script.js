/* ==========================================================
   QR Code Generator — Application Logic
   Pure vanilla JS, no frameworks
   ========================================================== */

(function () {
  'use strict';

  // ── DOM References ─────────────────────────────────────────
  const urlInput      = document.getElementById('urlInput');
  const clearBtn      = document.getElementById('clearBtn');
  const validationMsg = document.getElementById('validationMsg');
  const sizeSelect    = document.getElementById('sizeSelect');
  const fgColor       = document.getElementById('fgColor');
  const bgColor       = document.getElementById('bgColor');
  const fgColorLabel  = document.getElementById('fgColorLabel');
  const bgColorLabel  = document.getElementById('bgColorLabel');
  const logoUpload    = document.getElementById('logoUpload');
  const logoFileName  = document.getElementById('logoFileName');
  const logoRemoveBtn = document.getElementById('logoRemoveBtn');
  const generateBtn   = document.getElementById('generateBtn');
  const loader        = document.getElementById('loader');
  const qrOutput      = document.getElementById('qrOutput');
  const qrCanvas      = document.getElementById('qrCanvas');
  const downloadBtn   = document.getElementById('downloadBtn');
  const copyLinkBtn   = document.getElementById('copyLinkBtn');
  const toast         = document.getElementById('toast');
  // Note: no loader element — QR generation is instant in the browser

  // ── State ──────────────────────────────────────────────────
  let qrInstance    = null;   // Current EasyQRCode instance
  let logoDataURL   = null;   // Base64 data URL of uploaded logo
  let debounceTimer = null;   // Timer for auto-regenerate

  // ── Initialization ─────────────────────────────────────────
  function init() {
    bindEvents();
    urlInput.focus();
  }

  // ── Event Bindings ─────────────────────────────────────────
  function bindEvents() {
    // Generate on button click
    generateBtn.addEventListener('click', handleGenerate);

    // Auto-regenerate on input change (debounced)
    urlInput.addEventListener('input', () => {
      toggleClearBtn();
      clearValidation();
      debouncedGenerate();
    });

    // Enter key triggers generate
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleGenerate();
      }
    });

    // Clear input button
    clearBtn.addEventListener('click', () => {
      urlInput.value = '';
      toggleClearBtn();
      clearValidation();
      hideOutput();
      urlInput.focus();
    });

    // Option changes → auto-regenerate if there's content
    sizeSelect.addEventListener('change', autoRegenerate);
    fgColor.addEventListener('input', () => {
      fgColorLabel.textContent = fgColor.value.toUpperCase();
      autoRegenerate();
    });
    bgColor.addEventListener('input', () => {
      bgColorLabel.textContent = bgColor.value.toUpperCase();
      autoRegenerate();
    });

    // Logo upload
    logoUpload.addEventListener('change', handleLogoUpload);
    logoRemoveBtn.addEventListener('click', removeLogo);

    // Make the logo label keyboard-accessible
    const logoLabel = document.querySelector('.option-item__logo-btn');
    logoLabel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        logoUpload.click();
      }
    });

    // Download and Copy buttons
    downloadBtn.addEventListener('click', handleDownload);
    copyLinkBtn.addEventListener('click', handleCopyLink);
  }

  // ── Validation ─────────────────────────────────────────────
  /**
   * Validates the input value. Returns true if valid.
   */
  function validateInput() {
    const value = urlInput.value.trim();

    if (!value) {
      showValidation('Please enter a URL or text.', 'error');
      urlInput.classList.add('is-invalid');
      return false;
    }

    // Basic length check (QR codes have data limits)
    if (value.length > 4296) {
      showValidation('Text is too long for a QR code (max ~4296 chars).', 'error');
      urlInput.classList.add('is-invalid');
      return false;
    }

    return true;
  }

  function showValidation(msg, type) {
    validationMsg.textContent = msg;
    validationMsg.className = 'input-group__validation';
    validationMsg.classList.add(type === 'error' ? 'is-error' : 'is-success');
  }

  function clearValidation() {
    validationMsg.textContent = '';
    validationMsg.className = 'input-group__validation';
    urlInput.classList.remove('is-invalid');
  }

  // ── Clear Button Visibility ────────────────────────────────
  function toggleClearBtn() {
    clearBtn.hidden = urlInput.value.length === 0;
  }

  // ── Logo Handling ──────────────────────────────────────────
  function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please upload a valid image file.', 'error');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo must be under 2 MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      logoDataURL = ev.target.result;

      // Update UI
      const name = file.name.length > 12
        ? file.name.substring(0, 10) + '…'
        : file.name;
      logoFileName.textContent = name;
      document.querySelector('.option-item__logo-btn').classList.add('has-file');
      logoRemoveBtn.hidden = false;

      autoRegenerate();
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    logoDataURL = null;
    logoUpload.value = '';
    logoFileName.textContent = 'Upload';
    document.querySelector('.option-item__logo-btn').classList.remove('has-file');
    logoRemoveBtn.hidden = true;
    autoRegenerate();
  }

  // ── QR Generation ──────────────────────────────────────────
  function handleGenerate() {
    clearTimeout(debounceTimer);
    if (!validateInput()) return;
    generateQR();
  }

  /** Debounced auto-regenerate (500ms delay) */
  function debouncedGenerate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (urlInput.value.trim()) {
        generateQR();
      }
    }, 500);
  }

  /** Auto-regenerate only if QR output is already visible */
  function autoRegenerate() {
    if (!qrOutput.hidden && urlInput.value.trim()) {
      generateQR();
    }
  }

  /**
   * Core QR generation using EasyQRCodeJS.
   * Builds config, shows loader, renders QR.
   */
  function generateQR() {
    const text = urlInput.value.trim();
    if (!text) return;

    const size = parseInt(sizeSelect.value, 10);
    const fg   = fgColor.value;
    const bg   = bgColor.value;

    // Hide old output, clear canvas
    hideOutput();
    qrCanvas.innerHTML = '';
    qrInstance = null;

    // Build EasyQRCode options
    const options = {
      text: text,
      width: size,
      height: size,
      colorDark: fg,
      colorLight: bg,
      correctLevel: QRCode.CorrectLevel.H, // High error correction (needed for logos)
      quietZone: 12,
      quietZoneColor: bg
    };

    // Add logo if uploaded
    if (logoDataURL) {
      options.logo = logoDataURL;
      options.logoWidth = Math.round(size * 0.22);
      options.logoHeight = Math.round(size * 0.22);
      options.logoBackgroundTransparent = false;
      options.logoBackgroundColor = bg;
    }

    try {
      qrInstance = new QRCode(qrCanvas, options);
      showOutput();
      clearValidation();
    } catch (err) {
      showValidation('Failed to generate QR code. Try shorter text.', 'error');
      console.error('QR generation error:', err);
    }
  }

  // ── Output Visibility ─────────────────────────────────────
  function showOutput() {
    qrOutput.hidden = false;
    // Re-trigger the fade-in animation
    qrOutput.style.animation = 'none';
    // Force reflow
    void qrOutput.offsetHeight;
    qrOutput.style.animation = '';
  }

  function hideOutput() {
    qrOutput.hidden = true;
  }

  // ── Download QR as PNG ─────────────────────────────────────
  function handleDownload() {
    const canvas = qrCanvas.querySelector('canvas');
    const img    = qrCanvas.querySelector('img');

    let dataURL = null;

    if (canvas) {
      dataURL = canvas.toDataURL('image/png');
    } else if (img) {
      // Convert img to canvas to get PNG
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width  = img.naturalWidth;
      tempCanvas.height = img.naturalHeight;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      dataURL = tempCanvas.toDataURL('image/png');
    }

    if (!dataURL) {
      showToast('Nothing to download yet.', 'error');
      return;
    }

    // Create download link
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('✅ QR code downloaded!', 'success');
  }

  // ── Copy Original Link ─────────────────────────────────────
  async function handleCopyLink() {
    const text = urlInput.value.trim();
    if (!text) {
      showToast('No link to copy.', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast('📋 Link copied to clipboard!', 'success');
    } catch {
      // Fallback for older browsers or insecure contexts
      fallbackCopy(text);
    }
  }

  /** Fallback copy method using a temporary textarea */
  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
      showToast('📋 Link copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy. Please copy manually.', 'error');
    }

    document.body.removeChild(textarea);
  }

  // ── Toast Notifications ────────────────────────────────────
  let toastTimeout = null;

  /**
   * Shows a toast notification at the bottom of the screen.
   * @param {string} message - Text to display
   * @param {'success'|'error'} type - Toast style
   */
  function showToast(message, type = 'success') {
    clearTimeout(toastTimeout);

    toast.textContent = message;
    toast.className = 'toast';
    toast.classList.add(type === 'error' ? 'toast--error' : 'toast--success');

    // Force reflow to restart transition
    void toast.offsetHeight;
    toast.classList.add('is-visible');

    toastTimeout = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3000);
  }

  // ── Start ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();

// QR Code Modal and Download Functionality

function showQR() {
  const modal = document.getElementById('qr-modal');
  if (modal) {
    modal.classList.add('show');
  }
}

function hideQR() {
  const modal = document.getElementById('qr-modal');
  if (modal) {
    modal.classList.remove('show');
  }
}

function downloadQRCode() {
  // Get the slug from the page (set by the server)
  const slug = window.qrSlug || 'qr-code';
  
  // Convert SVG to PNG for download
  const svg = document.querySelector('#qr-code-container svg') || 
               document.querySelector('#qr-code-display svg');
  
  if (!svg) {
    console.error('QR code SVG not found');
    return;
  }
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const svgData = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  
  canvas.width = 400;
  canvas.height = 400;
  
  img.onload = function() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 400, 400);
    ctx.drawImage(img, 0, 0);
    
    canvas.toBlob(function(blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qr-' + slug + '.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  };
  
  // Use modern encoding approach
  const encoded = encodeURIComponent(svgData).replace(/%([0-9A-F]{2})/g, (_, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  });
  img.src = 'data:image/svg+xml;base64,' + btoa(encoded);
}

// Hotkey support
document.addEventListener('keydown', function(e) {
  // Q key to toggle QR modal
  if (e.key === 'q' || e.key === 'Q') {
    const modal = document.getElementById('qr-modal');
    if (!modal) return;
    
    if (modal.classList.contains('show')) {
      hideQR();
    } else {
      showQR();
    }
  }
  
  // ESC key to close modal
  if (e.key === 'Escape') {
    hideQR();
  }
});

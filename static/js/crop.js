(function () {
    const fileInput = document.getElementById('file-input');
    const dropArea = document.getElementById('drop-area');
    const uploadArea = document.getElementById('upload-area');
    const editorArea = document.getElementById('editor-area');
    const cropImage = document.getElementById('crop-image');
    const downloadBtn = document.getElementById('download-btn');
    const changeImageBtn = document.getElementById('change-image-btn');
    const resetBtn = document.getElementById('reset-btn');
    const outputFormat = document.getElementById('output-format');

    const infoW = document.getElementById('info-w');
    const infoH = document.getElementById('info-h');
    const infoX = document.getElementById('info-x');
    const infoY = document.getElementById('info-y');

    let cropper = null;
    let currentFileName = 'crop';
    let scaleX = 1;
    let scaleY = 1;

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('upload-drop-area--hover');
    });
    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('upload-drop-area--hover');
    });
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('upload-drop-area--hover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadFile(file);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) loadFile(fileInput.files[0]);
    });

    function loadFile(file) {
        currentFileName = file.name.replace(/\.[^.]+$/, '');
        const url = URL.createObjectURL(file);
        cropImage.src = url;

        uploadArea.classList.add('hidden');
        editorArea.classList.remove('hidden');

        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        scaleX = 1;
        scaleY = 1;

        cropImage.onload = () => {
            cropper = new Cropper(cropImage, {
                viewMode: 1,
                autoCropArea: 0.8,
                responsive: true,
                restore: false,
                guides: true,
                center: true,
                highlight: true,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
                crop(event) {
                    const d = event.detail;
                    infoW.textContent = Math.round(d.width) + 'px';
                    infoH.textContent = Math.round(d.height) + 'px';
                    infoX.textContent = Math.round(d.x) + 'px';
                    infoY.textContent = Math.round(d.y) + 'px';
                },
            });
        };
    }

    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('ratio-btn--active'));
            btn.classList.add('ratio-btn--active');
            const ratio = parseFloat(btn.dataset.ratio);
            if (cropper) cropper.setAspectRatio(isNaN(ratio) ? NaN : ratio);
        });
    });

    document.getElementById('rotate-left').addEventListener('click', () => cropper && cropper.rotate(-90));
    document.getElementById('rotate-right').addEventListener('click', () => cropper && cropper.rotate(90));

    document.getElementById('flip-h').addEventListener('click', () => {
        if (!cropper) return;
        scaleX = -scaleX;
        cropper.scaleX(scaleX);
    });
    document.getElementById('flip-v').addEventListener('click', () => {
        if (!cropper) return;
        scaleY = -scaleY;
        cropper.scaleY(scaleY);
    });

    resetBtn.addEventListener('click', () => {
        if (!cropper) return;
        scaleX = 1;
        scaleY = 1;
        cropper.reset();
    });

    downloadBtn.addEventListener('click', () => {
        if (!cropper) return;
        const mime = outputFormat.value;
        const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
        const quality = mime === 'image/png' ? undefined : 0.92;

        cropper.getCroppedCanvas().toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${currentFileName}_crop.${ext}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        }, mime, quality);
    });

    changeImageBtn.addEventListener('click', () => {
        if (cropper) { cropper.destroy(); cropper = null; }
        cropImage.src = '';
        fileInput.value = '';
        editorArea.classList.add('hidden');
        uploadArea.classList.remove('hidden');
    });
})();

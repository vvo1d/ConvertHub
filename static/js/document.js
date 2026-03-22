/**
 * ConvertHub — Document conversion logic
 */

(function () {
    'use strict';

    const MAX_FILES = 10;
    const MAX_SIZE = 50 * 1024 * 1024;

    const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp']);
    const ACCEPT_EXTS = new Set(['pdf', 'docx', 'md', 'html', 'htm', 'txt', ...IMAGE_EXTS]);

    // Conversion options per source extension
    const CONVERSION_MAP = {
        'pdf':  [
            { value: 'pdf-to-docx', label: 'DOCX' },
            { value: 'pdf-to-images', label: 'Изображения (PNG/JPEG)' },
            { value: 'pdf-ocr', label: 'OCR → Текст (распознавание)' },
            { value: 'pdf-ocr-docx', label: 'OCR → DOCX (распознавание)' },
        ],
        'docx': [{ value: 'docx-to-pdf', label: 'PDF' }],
        'md':   [
            { value: 'md-to-pdf', label: 'PDF' },
            { value: 'md-to-html', label: 'HTML' },
        ],
        'html': [{ value: 'html-to-pdf', label: 'PDF' }],
        'htm':  [{ value: 'html-to-pdf', label: 'PDF' }],
        'txt':  [{ value: 'txt-to-pdf', label: 'PDF' }],
    };

    // --- Toast (reuse from global scope or define locally) ---
    const toastContainer = document.getElementById('toast-container');

    function showToast(message, type = 'error', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            toast.style.transition = '0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 Б';
        const units = ['Б', 'КБ', 'МБ', 'ГБ'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
    }

    function getExt(name) {
        const parts = name.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getNoun(n, one, few, many) {
        const abs = Math.abs(n) % 100;
        const last = abs % 10;
        if (abs > 10 && abs < 20) return many;
        if (last > 1 && last < 5) return few;
        if (last === 1) return one;
        return many;
    }

    // --- Page detection ---
    const uploadZone = document.getElementById('doc-upload-zone');
    if (!uploadZone) return;

    const fileInput = document.getElementById('doc-file-input');
    const fileInputMore = document.getElementById('doc-file-input-more');
    const fileListSection = document.getElementById('doc-file-list-section');
    const fileListEl = document.getElementById('doc-file-list');
    const fileCountEl = document.getElementById('doc-file-count');
    const addMoreEl = document.getElementById('doc-add-more');
    const clearAllBtn = document.getElementById('doc-clear-all');
    const settingsSection = document.getElementById('doc-settings-section');
    const conversionSelect = document.getElementById('doc-conversion-type');
    const pdfImagesSettings = document.getElementById('pdf-images-settings');
    const pdfImagesFormat = document.getElementById('pdf-images-format');
    const pdfImagesDpi = document.getElementById('pdf-images-dpi');
    const dpiValue = document.getElementById('dpi-value');
    const convertBtn = document.getElementById('doc-convert-btn');
    const progressSection = document.getElementById('doc-progress-section');
    const progressFill = document.getElementById('doc-progress-fill');
    const progressText = document.getElementById('doc-progress-text');
    const resultSection = document.getElementById('doc-result-section');
    const resultListEl = document.getElementById('doc-result-list');
    const downloadBtn = document.getElementById('doc-download-btn');
    const downloadAllBtn = document.getElementById('doc-download-all-btn');
    const convertAnotherBtn = document.getElementById('doc-convert-another');

    /** @type {File[]} */
    let selectedFiles = [];
    /** 'document' for single doc conversions, 'images-to-pdf' for merging images */
    let mode = 'document';

    // --- Drag and drop ---
    uploadZone.addEventListener('click', (e) => {
        if (e.target.closest('.upload-zone__btn') || e.target === fileInput) return;
        fileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('upload-zone--hover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('upload-zone--hover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('upload-zone--hover');
        addFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) addFiles(fileInput.files);
        fileInput.value = '';
    });

    fileInputMore.addEventListener('change', () => {
        if (fileInputMore.files.length > 0) addFiles(fileInputMore.files);
        fileInputMore.value = '';
    });

    // --- File management ---
    function addFiles(fileListInput) {
        const files = Array.from(fileListInput);

        for (const file of files) {
            if (selectedFiles.length >= MAX_FILES) {
                showToast(`Максимум ${MAX_FILES} файлов`);
                break;
            }

            const ext = getExt(file.name);
            if (!ACCEPT_EXTS.has(ext)) {
                showToast(`${file.name}: недопустимый формат`);
                continue;
            }
            if (file.size > MAX_SIZE) {
                showToast(`${file.name}: файл слишком большой`);
                continue;
            }

            selectedFiles.push(file);
        }

        detectMode();
        updateUI();
    }

    function removeFile(index) {
        selectedFiles.splice(index, 1);
        detectMode();
        updateUI();
    }

    function detectMode() {
        if (selectedFiles.length === 0) {
            mode = 'document';
            return;
        }

        const allImages = selectedFiles.every(f => IMAGE_EXTS.has(getExt(f.name)));
        const hasDoc = selectedFiles.some(f => !IMAGE_EXTS.has(getExt(f.name)));

        if (allImages && selectedFiles.length >= 1) {
            mode = 'images-to-pdf';
        } else if (hasDoc) {
            // Keep only the first document, discard others
            const docFile = selectedFiles.find(f => !IMAGE_EXTS.has(getExt(f.name)));
            if (selectedFiles.length > 1) {
                showToast('Для документов поддерживается только один файл');
            }
            selectedFiles = [docFile];
            mode = 'document';
        }
    }

    function updateUI() {
        if (selectedFiles.length === 0) {
            uploadZone.classList.remove('hidden');
            fileListSection.classList.add('hidden');
            settingsSection.classList.add('hidden');
            resultSection.classList.add('hidden');
            return;
        }

        uploadZone.classList.add('hidden');
        fileListSection.classList.remove('hidden');
        settingsSection.classList.remove('hidden');
        resultSection.classList.add('hidden');

        // File count
        const noun = getNoun(selectedFiles.length, 'файл', 'файла', 'файлов');
        fileCountEl.textContent = `${selectedFiles.length} ${noun}`;

        // File list
        fileListEl.innerHTML = '';
        selectedFiles.forEach((file, idx) => {
            const ext = getExt(file.name).toUpperCase();
            const row = document.createElement('div');
            row.className = 'file-row';
            row.innerHTML = `
                <span class="file-row__ext-badge">${escapeHtml(ext)}</span>
                <div class="file-row__info">
                    <span class="file-row__name">${escapeHtml(file.name)}</span>
                    <span class="file-row__size">${formatSize(file.size)}</span>
                </div>
                <button class="btn btn--ghost btn--sm file-row__remove" data-idx="${idx}" title="Удалить">✕</button>
            `;
            fileListEl.appendChild(row);
        });

        // "Add more" only for images-to-pdf
        addMoreEl.classList.toggle('hidden', mode !== 'images-to-pdf' || selectedFiles.length >= MAX_FILES);

        // Conversion options
        updateConversionOptions();
        convertBtn.disabled = false;
    }

    function updateConversionOptions() {
        conversionSelect.innerHTML = '';

        if (mode === 'images-to-pdf') {
            const opt = document.createElement('option');
            opt.value = 'images-to-pdf';
            opt.textContent = 'Объединить в PDF';
            conversionSelect.appendChild(opt);
            pdfImagesSettings.classList.add('hidden');
        } else {
            const ext = getExt(selectedFiles[0].name);
            const options = CONVERSION_MAP[ext] || [];

            if (options.length === 0) {
                conversionSelect.innerHTML = '<option value="">Нет доступных конвертаций</option>';
                convertBtn.disabled = true;
                pdfImagesSettings.classList.add('hidden');
                return;
            }

            for (const opt of options) {
                const el = document.createElement('option');
                el.value = opt.value;
                el.textContent = opt.label;
                conversionSelect.appendChild(el);
            }

            togglePdfImagesSettings();
        }
    }

    function togglePdfImagesSettings() {
        const isPdfToImages = conversionSelect.value === 'pdf-to-images';
        pdfImagesSettings.classList.toggle('hidden', !isPdfToImages);
    }

    // Delegate events
    fileListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.file-row__remove');
        if (btn) removeFile(parseInt(btn.dataset.idx));
    });

    clearAllBtn.addEventListener('click', () => {
        selectedFiles = [];
        updateUI();
    });

    conversionSelect.addEventListener('change', togglePdfImagesSettings);

    pdfImagesDpi.addEventListener('input', () => {
        dpiValue.textContent = pdfImagesDpi.value;
    });

    // --- Conversion ---
    convertBtn.addEventListener('click', startConversion);

    async function startConversion() {
        if (selectedFiles.length === 0) return;

        convertBtn.disabled = true;
        progressSection.classList.remove('hidden');
        resultSection.classList.add('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = 'Конвертация...';

        const convType = conversionSelect.value;

        try {
            let result;

            if (convType === 'images-to-pdf') {
                result = await convertImagesToPdf();
            } else if (convType === 'pdf-to-images') {
                result = await convertPdfToImages();
            } else {
                result = await convertDocument(convType);
            }

            progressFill.style.width = '100%';
            progressText.textContent = 'Готово!';
            setTimeout(() => progressSection.classList.add('hidden'), 300);

            showResults(convType, result);
            showToast('Конвертация завершена!', 'success');

        } catch (err) {
            progressSection.classList.add('hidden');
            showToast(err.message || 'Ошибка конвертации');
            convertBtn.disabled = false;
        }
    }

    async function convertDocument(convType) {
        const formData = new FormData();
        formData.append('file', selectedFiles[0]);
        formData.append('conversion_type', convType);

        progressFill.style.width = '30%';
        const resp = await fetch('/api/convert/document', { method: 'POST', body: formData });
        progressFill.style.width = '90%';
        const data = await resp.json();

        if (!data.success) throw new Error(data.error);
        return data;
    }

    async function convertPdfToImages() {
        const formData = new FormData();
        formData.append('file', selectedFiles[0]);
        formData.append('format', pdfImagesFormat.value);
        formData.append('dpi', pdfImagesDpi.value);

        progressFill.style.width = '30%';
        const resp = await fetch('/api/convert/pdf-to-images', { method: 'POST', body: formData });
        progressFill.style.width = '90%';
        const data = await resp.json();

        if (!data.success) throw new Error(data.error);
        return data;
    }

    async function convertImagesToPdf() {
        const formData = new FormData();
        for (const file of selectedFiles) {
            formData.append('files', file);
        }

        progressFill.style.width = '30%';
        const resp = await fetch('/api/convert/images-to-pdf', { method: 'POST', body: formData });
        progressFill.style.width = '90%';
        const data = await resp.json();

        if (!data.success) throw new Error(data.error);
        return data;
    }

    // --- Results ---
    function showResults(convType, data) {
        resultSection.classList.remove('hidden');
        resultListEl.innerHTML = '';
        downloadBtn.classList.add('hidden');
        downloadAllBtn.classList.add('hidden');

        if (convType === 'pdf-to-images') {
            // Multiple files result
            for (const fileInfo of data.files) {
                const row = document.createElement('div');
                row.className = 'result-row';
                row.innerHTML = `
                    <img class="result-row__thumb" src="${fileInfo.download_url}" alt="">
                    <div class="result-row__info">
                        <span class="result-row__name">${escapeHtml(fileInfo.filename)}</span>
                    </div>
                    <a class="btn btn--outline btn--sm" href="${fileInfo.download_url}" download="${fileInfo.filename}">Скачать</a>
                `;
                resultListEl.appendChild(row);
            }

            // Summary
            const summary = document.createElement('div');
            summary.className = 'result-summary';
            summary.innerHTML = `<span>${data.page_count} ${getNoun(data.page_count, 'страница', 'страницы', 'страниц')}</span>`;
            resultListEl.appendChild(summary);

            // Download all as ZIP
            if (data.files.length > 1) {
                downloadAllBtn.classList.remove('hidden');
                downloadAllBtn.onclick = () => downloadZip(data.files.map(f => f.filename));
            }
        } else {
            // Single file result
            const saving = data.original_size > 0
                ? Math.round((1 - data.converted_size / data.original_size) * 100)
                : 0;

            const row = document.createElement('div');
            row.className = 'result-row';
            row.innerHTML = `
                <span class="file-row__ext-badge">${getExt(data.filename).toUpperCase()}</span>
                <div class="result-row__info">
                    <span class="result-row__name">${escapeHtml(data.filename)}</span>
                    <span class="result-row__sizes">
                        ${formatSize(data.original_size)} → ${formatSize(data.converted_size)}
                    </span>
                </div>
                <a class="btn btn--outline btn--sm" href="${data.download_url}" download="${data.filename}">Скачать</a>
            `;
            resultListEl.appendChild(row);

            downloadBtn.classList.remove('hidden');
            downloadBtn.href = data.download_url;
            downloadBtn.download = data.filename;
            downloadBtn.textContent = 'Скачать';
        }
    }

    async function downloadZip(filenames) {
        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = 'Упаковка...';

        try {
            const resp = await fetch('/api/download-zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filenames }),
            });

            if (!resp.ok) throw new Error('Ошибка сервера');

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'converthub_documents.zip';
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            showToast('Ошибка скачивания: ' + err.message);
        } finally {
            downloadAllBtn.disabled = false;
            downloadAllBtn.textContent = 'Скачать все (ZIP)';
        }
    }

    // --- Reset ---
    convertAnotherBtn.addEventListener('click', () => {
        selectedFiles = [];
        mode = 'document';
        updateUI();
    });

})();

/**
 * ConvertHub — Frontend logic
 * Multi-file drag-and-drop, per-file conversion, download all as ZIP
 */

(function () {
    'use strict';

    const MAX_FILES = 10;
    const MAX_SIZE = 50 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/tiff', 'image/webp', 'image/x-icon', 'image/svg+xml'];
    const QUALITY_FORMATS = new Set(['JPEG', 'WEBP']);

    // --- Toast notifications ---
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

    // --- Page detection ---
    const uploadZone = document.getElementById('upload-zone');
    if (!uploadZone) return;

    const fileInput = document.getElementById('file-input');
    const fileInputMore = document.getElementById('file-input-more');
    const fileListSection = document.getElementById('file-list-section');
    const fileListEl = document.getElementById('file-list');
    const fileCountEl = document.getElementById('file-count');
    const clearAllBtn = document.getElementById('clear-all');
    const settingsSection = document.getElementById('settings-section');
    const formatSelect = document.getElementById('format-select');
    const qualityGroup = document.getElementById('quality-group');
    const qualityRange = document.getElementById('quality-range');
    const qualityValue = document.getElementById('quality-value');
    const convertBtn = document.getElementById('convert-btn');
    const resultSection = document.getElementById('result-section');
    const resultListEl = document.getElementById('result-list');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const convertAnotherBtn = document.getElementById('convert-another');

    /** @type {{file: File, id: string, previewUrl: string}[]} */
    let selectedFiles = [];
    /** @type {{filename: string, download_url: string, original_size: number, converted_size: number}[]} */
    let conversionResults = [];

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

    // --- Ctrl+V paste ---
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) addFiles([file]);
                return;
            }
        }
    });

    // --- File management ---
    function addFiles(fileListInput) {
        const files = Array.from(fileListInput);

        for (const file of files) {
            if (selectedFiles.length >= MAX_FILES) {
                showToast(`Максимум ${MAX_FILES} файлов`);
                break;
            }
            if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(svg|ico|tiff?)$/i)) {
                showToast(`${file.name}: недопустимый формат`);
                continue;
            }
            if (file.size > MAX_SIZE) {
                showToast(`${file.name}: файл слишком большой (макс. 50 МБ)`);
                continue;
            }

            const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
            const previewUrl = URL.createObjectURL(file);
            selectedFiles.push({ file, id, previewUrl });
        }

        updateFileList();
    }

    function removeFile(id) {
        const idx = selectedFiles.findIndex(f => f.id === id);
        if (idx !== -1) {
            URL.revokeObjectURL(selectedFiles[idx].previewUrl);
            selectedFiles.splice(idx, 1);
        }
        updateFileList();
    }

    function updateFileList() {
        if (selectedFiles.length === 0) {
            uploadZone.classList.remove('hidden');
            fileListSection.classList.add('hidden');
            settingsSection.classList.add('hidden');
            resultSection.classList.add('hidden');
            convertBtn.disabled = true;
            return;
        }

        uploadZone.classList.add('hidden');
        fileListSection.classList.remove('hidden');
        settingsSection.classList.remove('hidden');
        resultSection.classList.add('hidden');
        convertBtn.disabled = false;

        const noun = getNoun(selectedFiles.length, 'файл', 'файла', 'файлов');
        fileCountEl.textContent = `${selectedFiles.length} ${noun}`;

        fileListEl.innerHTML = '';
        for (const entry of selectedFiles) {
            const row = document.createElement('div');
            row.className = 'file-row';
            row.dataset.id = entry.id;
            row.innerHTML = `
                <img class="file-row__thumb" src="${entry.previewUrl}" alt="">
                <div class="file-row__info">
                    <span class="file-row__name">${escapeHtml(entry.file.name)}</span>
                    <span class="file-row__size">${formatSize(entry.file.size)}</span>
                </div>
                <div class="file-row__status" id="status-${entry.id}"></div>
                <button class="btn btn--ghost btn--sm file-row__remove" data-id="${entry.id}" title="Удалить">✕</button>
            `;
            fileListEl.appendChild(row);
        }

        // Show/hide "add more" button
        const addMoreSection = fileListSection.querySelector('.file-list-add');
        if (addMoreSection) {
            addMoreSection.classList.toggle('hidden', selectedFiles.length >= MAX_FILES);
        }
    }

    // Delegate remove clicks
    fileListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.file-row__remove');
        if (btn) removeFile(btn.dataset.id);
    });

    clearAllBtn.addEventListener('click', () => {
        for (const entry of selectedFiles) URL.revokeObjectURL(entry.previewUrl);
        selectedFiles = [];
        updateFileList();
    });

    // --- Quality visibility ---
    formatSelect.addEventListener('change', updateQualityVisibility);
    updateQualityVisibility();

    function updateQualityVisibility() {
        qualityGroup.style.display = QUALITY_FORMATS.has(formatSelect.value) ? '' : 'none';
    }

    qualityRange.addEventListener('input', () => {
        qualityValue.textContent = qualityRange.value;
    });

    // --- Conversion ---
    convertBtn.addEventListener('click', startConversion);

    async function startConversion() {
        if (selectedFiles.length === 0) return;

        convertBtn.disabled = true;
        resultSection.classList.add('hidden');
        conversionResults = [];

        const format = formatSelect.value;
        const quality = qualityRange.value;

        // Convert all files in parallel
        const promises = selectedFiles.map(entry => convertSingleFile(entry, format, quality));
        await Promise.all(promises);

        const succeeded = conversionResults.length;
        const failed = selectedFiles.length - succeeded;

        if (succeeded > 0) {
            showResults();
            if (failed > 0) {
                showToast(`${succeeded} конвертировано, ${failed} с ошибками`, 'success');
            } else {
                showToast(`${succeeded} ${getNoun(succeeded, 'файл конвертирован', 'файла конвертировано', 'файлов конвертировано')}!`, 'success');
            }
        } else {
            showToast('Не удалось конвертировать ни один файл');
            convertBtn.disabled = false;
        }
    }

    async function convertSingleFile(entry, format, quality) {
        const statusEl = document.getElementById(`status-${entry.id}`);
        const row = fileListEl.querySelector(`[data-id="${entry.id}"]`);

        statusEl.innerHTML = '<span class="file-row__spinner"></span>';
        row?.classList.add('file-row--processing');

        const formData = new FormData();
        formData.append('file', entry.file);
        formData.append('format', format);
        formData.append('quality', quality);
        formData.append('width', '0');
        formData.append('height', '0');

        try {
            const resp = await fetch('/api/convert/image', { method: 'POST', body: formData });
            const data = await resp.json();

            if (data.success) {
                statusEl.innerHTML = '<span class="file-row__status-ok">✓</span>';
                row?.classList.remove('file-row--processing');
                row?.classList.add('file-row--done');
                conversionResults.push({
                    name: entry.file.name,
                    filename: data.filename,
                    download_url: data.download_url,
                    original_size: data.original_size,
                    converted_size: data.converted_size,
                });
            } else {
                statusEl.innerHTML = `<span class="file-row__status-err" title="${escapeHtml(data.error)}">✗</span>`;
                row?.classList.remove('file-row--processing');
                row?.classList.add('file-row--error');
            }
        } catch {
            statusEl.innerHTML = '<span class="file-row__status-err" title="Сетевая ошибка">✗</span>';
            row?.classList.remove('file-row--processing');
            row?.classList.add('file-row--error');
        }
    }

    // --- Results ---
    function showResults() {
        resultSection.classList.remove('hidden');
        resultListEl.innerHTML = '';

        let totalOriginal = 0;
        let totalConverted = 0;

        for (const r of conversionResults) {
            totalOriginal += r.original_size;
            totalConverted += r.converted_size;

            const saving = r.original_size > 0
                ? Math.round((1 - r.converted_size / r.original_size) * 100)
                : 0;
            const savingClass = saving > 0 ? 'accent' : 'danger';

            const row = document.createElement('div');
            row.className = 'result-row';
            row.innerHTML = `
                <img class="result-row__thumb" src="${r.download_url}" alt="">
                <div class="result-row__info">
                    <span class="result-row__name">${escapeHtml(r.name)}</span>
                    <span class="result-row__sizes">
                        ${formatSize(r.original_size)} → ${formatSize(r.converted_size)}
                        <span class="result-row__saving ${savingClass}">${saving > 0 ? '−' : '+'}${Math.abs(saving)}%</span>
                    </span>
                </div>
                <a class="btn btn--outline btn--sm" href="${r.download_url}" download="${r.filename}">Скачать</a>
            `;
            resultListEl.appendChild(row);
        }

        // Summary
        const totalSaving = totalOriginal > 0 ? Math.round((1 - totalConverted / totalOriginal) * 100) : 0;
        const summaryEl = document.createElement('div');
        summaryEl.className = 'result-summary';
        summaryEl.innerHTML = `
            <span>Итого: ${formatSize(totalOriginal)} → ${formatSize(totalConverted)}</span>
            <span class="${totalSaving > 0 ? 'accent' : 'danger'}">${totalSaving > 0 ? '−' : '+'}${Math.abs(totalSaving)}%</span>
        `;
        resultListEl.appendChild(summaryEl);

        // Hide download-all if only one file
        downloadAllBtn.classList.toggle('hidden', conversionResults.length <= 1);
    }

    // --- Download all as ZIP ---
    downloadAllBtn.addEventListener('click', async () => {
        if (conversionResults.length === 0) return;

        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = 'Упаковка...';

        try {
            const resp = await fetch('/api/download-zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: conversionResults.map(r => r.filename) }),
            });

            if (!resp.ok) throw new Error('Ошибка сервера');

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'converthub_images.zip';
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            showToast('Ошибка скачивания: ' + err.message);
        } finally {
            downloadAllBtn.disabled = false;
            downloadAllBtn.textContent = 'Скачать все (ZIP)';
        }
    });

    // --- Convert another ---
    convertAnotherBtn.addEventListener('click', () => {
        for (const entry of selectedFiles) URL.revokeObjectURL(entry.previewUrl);
        selectedFiles = [];
        conversionResults = [];
        updateFileList();
    });

    // --- Helpers ---
    function getNoun(n, one, few, many) {
        const abs = Math.abs(n) % 100;
        const last = abs % 10;
        if (abs > 10 && abs < 20) return many;
        if (last > 1 && last < 5) return few;
        if (last === 1) return one;
        return many;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();

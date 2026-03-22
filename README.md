# ConvertHub

Универсальный веб-конвертер файлов на Flask. Поддерживает конвертацию изображений и документов.

## Возможности

### Изображения
- Конвертация между PNG, JPG, GIF, BMP, TIFF, WebP, ICO
- Пакетная обработка до 10 файлов одновременно
- Drag-and-drop / вставка из буфера (Ctrl+V)
- Настройка качества и размера
- Скачивание результатов по одному или ZIP-архивом

### Документы
- PDF → DOCX (прямая конвертация)
- PDF → DOCX через OCR (для сканированных документов)
- PDF → Изображения (PNG/JPEG, настраиваемый DPI)
- PDF → Текст через OCR (распознавание)
- DOCX → PDF
- Markdown → PDF / HTML
- HTML → PDF
- TXT → PDF
- Изображения → PDF (объединение нескольких файлов)

### Общее
- Автоочистка файлов старше 1 часа
- Валидация MIME-типов через libmagic
- Полная поддержка кириллицы в PDF (шрифты DejaVu Sans)

## Системные зависимости

### macOS

```bash
brew install libmagic tesseract tesseract-lang
```

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y libmagic1 tesseract-ocr tesseract-ocr-rus
```

`tesseract-ocr-rus` — языковой пакет для распознавания русского текста. Для других языков установите соответствующий пакет `tesseract-ocr-<lang>` (список: `apt search tesseract-ocr-`).

### Fedora / RHEL / CentOS

```bash
sudo dnf install file-libs tesseract tesseract-langpack-rus
```

### Arch Linux

```bash
sudo pacman -S file tesseract tesseract-data-rus
```

## Запуск

```bash
# Виртуальное окружение
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Запуск
flask run
```

Открыть http://127.0.0.1:5000

## Структура

```
├── app.py                      # Flask-приложение
├── config.py                   # Конфигурация
├── requirements.txt            # Python-зависимости
├── converters/
│   ├── image_converter.py      # Конвертация изображений (Pillow)
│   └── document_converter.py   # Конвертация документов (reportlab, pdf2docx, pytesseract)
├── templates/                  # Jinja2-шаблоны
├── static/
│   ├── css/style.css           # Стили (тёмная тема)
│   ├── js/main.js              # Фронтенд — изображения
│   ├── js/document.js          # Фронтенд — документы
│   └── fonts/                  # DejaVu Sans (кириллица в PDF)
└── uploads/                    # Временные файлы
```

## Деплой на сервер (Ubuntu/Debian)

### 1. Подготовка сервера

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip \
    libmagic1 tesseract-ocr tesseract-ocr-rus nginx
```

### 2. Клонирование и настройка

```bash
cd /opt
sudo git clone <repo-url> converthub
sudo chown -R www-data:www-data /opt/converthub

cd /opt/converthub
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

### 3. Переменные окружения

```bash
sudo nano /opt/converthub/.env
```

```
SECRET_KEY=<сгенерировать: python3 -c "import secrets; print(secrets.token_hex(32))">
```

### 4. Systemd-сервис

```bash
sudo nano /etc/systemd/system/converthub.service
```

```ini
[Unit]
Description=ConvertHub
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/converthub
EnvironmentFile=/opt/converthub/.env
ExecStart=/opt/converthub/venv/bin/gunicorn \
    --workers 4 \
    --bind 127.0.0.1:8000 \
    app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now converthub
sudo systemctl status converthub
```

### 5. Nginx (reverse proxy)

```bash
sudo nano /etc/nginx/sites-available/converthub
```

```nginx
server {
    listen 80;
    server_name example.com;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /opt/converthub/static/;
        expires 7d;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/converthub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

### 7. Автоочистка uploads (cron)

Приложение автоматически удаляет файлы старше 1 часа. Дополнительно можно настроить cron:

```bash
sudo crontab -u www-data -e
```

```
0 * * * * find /opt/converthub/uploads -type f -mmin +60 -delete
```

## Технологии

- **Backend:** Flask, Pillow, reportlab, pdf2docx, PyMuPDF, python-docx, pytesseract, python-magic
- **Frontend:** Vanilla JS, CSS (тёмная тема)

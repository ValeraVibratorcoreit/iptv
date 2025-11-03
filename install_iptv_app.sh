#!/bin/bash

# --- Конфигурация ---
# *** ОЧЕНЬ ВАЖНО: Замените эти URL на РЕАЛЬНЫЕ публичные ссылки к вашим файлам. ***
# URL для вашего IPK файла
IPK_DOWNLOAD_URL="https://github.com/ValeraVibratorcoreit/iptv/blob/main/com.valeravibrator.iptv_1.0.0_all.ipk"
# URL для этого скрипта (если вы хотите, чтобы другие его скачивали напрямую)
SCRIPT_DOWNLOAD_URL="https://github.com/ValeraVibratorcoreit/iptv/blob/main/install_iptv_app.sh"

DEVICE_NAME="mytv" # Имя устройства, которое вы зарегистрировали через ares-setup-device. Измените, если ваше устройство называется по-другому.
IPK_FILENAME="com.valeravibrator.iptv_1.0.0_all.ipk"

echo "==================================================="
echo "         Установщик IPTV приложения для webOS      "
echo "==================================================="
echo ""

# Проверка наличия curl
if ! command -v curl &> /dev/null
then
    echo "Ошибка: curl не найден. Пожалуйста, установите curl и попробуйте снова."
    exit 1
fi

# Проверка наличия ares-install
if ! command -v ares-install &> /dev/null
then
    echo "Ошибка: ares-install не найден. Пожалуйста, установите webOS TV SDK."
    echo "Смотрите: https://webostv.developer.lge.com/develop/sdk/installation/"
    exit 1
fi

echo "1. Загрузка файла приложения (${IPK_FILENAME})..."
curl -L -o "${IPK_FILENAME}" "${IPK_DOWNLOAD_URL}"

if [ $? -ne 0 ]; then
    echo "Ошибка: Не удалось загрузить ${IPK_FILENAME} с ${IPK_DOWNLOAD_URL}."
    echo "Проверьте URL и ваше интернет-соединение."
    exit 1
fi

echo "   Файл успешно загружен."
echo ""

echo "2. Установка приложения на webOS ТВ (${DEVICE_NAME})..."
echo "   Пожалуйста, убедитесь, что 'Режим разработчика' включен на вашем ТВ."
echo "   Также убедитесь, что ваше устройство '${DEVICE_NAME}' корректно настроено с 'ares-setup-device'."
echo "   Если SSH-ключ имеет passphrase, вам может потребоваться ввести ее."

ares-install --device "${DEVICE_NAME}" "${IPK_FILENAME}"

if [ $? -ne 0 ]; then
    echo "Ошибка: Не удалось установить ${IPK_FILENAME}."
    echo "Наиболее частые причины:"
    echo "   - ТВ не находится в 'Режиме разработчика'."
    echo "   - Устройство '${DEVICE_NAME}' не зарегистрировано или зарегистрировано некорректно."
    echo "   - Проблемы с SSH-ключами или passphrase между вашим ПК и ТВ."
    echo "   - Проблемы с сетевым подключением к ТВ."
    echo "   - ТВ ожидает подтверждения на экране."
    exit 1
fi

echo "   Приложение успешно установлено."
echo ""

echo "3. Очистка загруженного файла."
rm "${IPK_FILENAME}"

echo "==================================================="
echo "         Установка завершена! Наслаждайтесь!       "

echo "==================================================="

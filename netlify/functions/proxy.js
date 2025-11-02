exports.handler = async function(event, context) {
    // Получаем целевой URL из параметра запроса 'url'
    const targetUrl = event.queryStringParameters.url;

    if (!targetUrl) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "URL parameter is required." }),
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        };
    }

    try {
        // Делаем запрос к целевому URL
        const response = await fetch(targetUrl);
        const data = await response.arrayBuffer(); // Используем arrayBuffer для потокового видео

        // Возвращаем данные с CORS заголовками
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*", // Разрешаем всем доменам доступ к этому прокси
                "Content-Type": response.headers.get("Content-Type") || "application/vnd.apple.mpegurl", // Указываем тип контента, например, для HLS
            },
            body: Buffer.from(data).toString('base64'), // Конвертируем ArrayBuffer в base64 для передачи
            isBase64Encoded: true // Указываем, что тело закодировано в base64
        };
    } catch (error) {
        console.error("Proxy error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Proxy error", details: error.message }),
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        };
    }
};

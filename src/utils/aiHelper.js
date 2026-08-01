// src/utils/aiHelper.js
export async function parseAIResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!text.startsWith("data:") && !contentType.includes("event-stream")) {
    try {
      return { ok: response.ok, data: JSON.parse(text) };
    } catch (e) {
      return { ok: false, data: null, error: `JSON解析失败: ${e.message}` };
    }
  }

  const lines = text.split("\n");
  let fullContent = "";
  let lastData = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const jsonStr = trimmed.slice(5).trim();
    if (jsonStr === "[DONE]") continue;
    try {
      const chunk = JSON.parse(jsonStr);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) fullContent += delta;
      lastData = chunk;
    } catch {}
  }

  if (fullContent && lastData) {
    lastData.choices[0].message = { content: fullContent };
    return { ok: response.ok, data: lastData };
  }
  if (lastData) return { ok: response.ok, data: lastData };
  return { ok: false, data: null, error: "无法解析SSE响应" };
}

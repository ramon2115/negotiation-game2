import fetch from "node-fetch";

const HF_API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-mnli";

async function queryHuggingFace(text, numbers) {
  try {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: { candidate_labels: numbers.map(String) },
      }),
    });

    if (!response.ok) {
      let cause = "unknown";
      if (response.status === 401) cause = "unauthorized";
      else if (response.status === 429) cause = "rate_limit";

      console.error(`❌ Hugging Face API error: ${response.status} ${response.statusText} (cause: ${cause})`);
      return { errorCause: cause, status: response.status };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error("❌ HF fetch failed:", err);
    return { errorCause: "fetch_failed" };
  }
}

export async function extractOffer(message, role = "neutral") {
  const numberRegex = /\d+(\.\d+)?/g;
  const matches = message.match(numberRegex) || [];
  const numbers = matches.map((n) => parseFloat(n));

  let numbersFound = numbers.map((n) => ({
    value: n,
    context: "neutral",
    confidence: 0.5,
  }));

  let chosenOffer = numbers.length > 0 ? numbers[0] : null;
  let hfResult = null;
  let errorCause = null;

  if (numbers.length > 0) {
    hfResult = await queryHuggingFace(message, numbers);

    if (hfResult && hfResult.labels && hfResult.scores) {
      numbersFound = hfResult.labels.map((label, i) => ({
        value: parseFloat(label),
        context: "offer",
        confidence: hfResult.scores[i],
      }));

      if (role === "seller") {
        chosenOffer = Math.max(...numbersFound.map((n) => n.value));
      } else if (role === "buyer") {
        chosenOffer = Math.min(...numbersFound.map((n) => n.value));
      } else {
        const bestIndex = hfResult.scores.indexOf(Math.max(...hfResult.scores));
        chosenOffer = parseFloat(hfResult.labels[bestIndex]);
      }
    } else if (hfResult && hfResult.errorCause) {
      errorCause = hfResult.errorCause;
    }
  }

  return {
    offer: chosenOffer,
    numbersFound,
    rawModelOutput: hfResult,
    errorCause,
  };
}

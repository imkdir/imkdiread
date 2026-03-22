const { GoogleGenerativeAI } = require("@google/generative-ai");

const FREE_DICTIONARY_API_BASE =
  "https://api.dictionaryapi.dev/api/v2/entries/en/";
const WIKIMEDIA_PAGE_IMAGE_API_BASE = "https://en.wikipedia.org/w/api.php";

class LookupError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "LookupError";
    this.status = status;
  }
}

function extractPhoneticText(dictEntry) {
  let phoneticText = dictEntry?.phonetic || "";

  if (
    !phoneticText &&
    Array.isArray(dictEntry?.phonetics) &&
    dictEntry.phonetics.length > 0
  ) {
    const phoneticObj = dictEntry.phonetics.find((phonetic) => phonetic?.text);
    if (phoneticObj) phoneticText = phoneticObj.text;
  }

  return phoneticText;
}

function formatFreeDictionaryEntry(dictEntry) {
  return {
    word: dictEntry.word,
    lore_note: null,
    phonetic: extractPhoneticText(dictEntry),
    is_visualizable: false,
    image_url: null,
    meanings: (dictEntry.meanings || []).map((meaning) => ({
      partOfSpeech: meaning.partOfSpeech,
      definitions: (meaning.definitions || []).map((definition) => ({
        definition: definition.definition,
      })),
    })),
  };
}

async function lookupWithFreeDictionary(word) {
  const fallbackRes = await fetch(
    `${FREE_DICTIONARY_API_BASE}${encodeURIComponent(word)}`,
  );

  if (!fallbackRes.ok) {
    throw new LookupError("Word not found in dictionary.", 404);
  }

  const fallbackData = await fallbackRes.json();
  const dictEntry = fallbackData?.[0];

  if (!dictEntry) {
    throw new LookupError("Word not found in dictionary.", 404);
  }

  return {
    provider: "free-dictionary",
    result: formatFreeDictionaryEntry(dictEntry),
  };
}

function normalizeMeanings(meanings) {
  if (!Array.isArray(meanings)) {
    return [];
  }

  return meanings
    .map((meaning) => ({
      partOfSpeech:
        typeof meaning?.partOfSpeech === "string" ? meaning.partOfSpeech : "",
      definitions: Array.isArray(meaning?.definitions)
        ? meaning.definitions
            .map((definition) => ({
              definition:
                typeof definition?.definition === "string"
                  ? definition.definition
                  : "",
            }))
            .filter((definition) => definition.definition)
        : [],
    }))
    .filter(
      (meaning) => meaning.partOfSpeech || meaning.definitions.length > 0,
    );
}

function normalizeGeminiEntry(result, fallbackWord) {
  return {
    word:
      typeof result?.word === "string" && result.word.trim()
        ? result.word.trim()
        : fallbackWord,
    lore_note:
      typeof result?.lore_note === "string" && result.lore_note.trim()
        ? result.lore_note.trim()
        : null,
    phonetic:
      typeof result?.phonetic === "string" && result.phonetic.trim()
        ? result.phonetic.trim()
        : "",
    is_visualizable: result?.is_visualizable === true,
    image_url: null,
    meanings: normalizeMeanings(result?.meanings),
  };
}

async function lookupWikipediaThumbnail(word) {
  try {
    const wikiRes = await fetch(
      `${WIKIMEDIA_PAGE_IMAGE_API_BASE}?action=query&titles=${encodeURIComponent(word)}&prop=pageimages&format=json&pithumbsize=300`,
    );

    if (!wikiRes.ok) {
      return null;
    }

    const wikiData = await wikiRes.json();
    const pages = wikiData?.query?.pages;

    if (!pages || typeof pages !== "object") {
      return null;
    }

    for (const page of Object.values(pages)) {
      if (typeof page?.thumbnail?.source === "string") {
        return page.thumbnail.source;
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch Wikipedia image:", error);
    return null;
  }
}

async function lookupWithGemini({ word, workTitle, apiKey }) {
  if (!apiKey) {
    throw new LookupError("Gemini API key is not configured.", 503);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `
    You are an expert literary dictionary. The user is reading the book "${workTitle}".
    They are looking up: "${word}".

    Task 1: Determine if "${word}" is a specific character, place, or lore unique to "${workTitle}".
    If it IS, provide a brief encyclopedic explanation in the "lore_note" field.
    If it is JUST A STANDARD VOCABULARY WORD (like 'ephemeral', 'table', 'run'), you MUST set "lore_note" to exactly null (the JSON primitive, no quotes). Do not invent lore for normal words.

    Task 2: Provide the standard dictionary definition.
    Task 3: Determine if "${word}" is a physical, material object that could be photographed or drawn (for example "apple", "castle", or "sword"). Set "is_visualizable" to true or false.

    You MUST respond with ONLY a valid JSON object matching this exact structure. No markdown, no conversational text.
    {
      "word": "${word}",
      "lore_note": null,
      "phonetic": "the phonetic spelling (optional)",
      "is_visualizable": false,
      "meanings": [
        {
          "partOfSpeech": "noun",
          "definitions": [
            { "definition": "The precise definition of the word." }
          ]
        }
      ]
    }
  `;

  const generated = await model.generateContent(prompt);
  const responseText = generated.response.text();
  const result = normalizeGeminiEntry(JSON.parse(responseText), word);

  if (result.is_visualizable) {
    result.image_url = await lookupWikipediaThumbnail(result.word || word);
  }

  return {
    provider: "gemini",
    result,
  };
}

async function lookupContext({
  word,
  workTitle,
  mode = "context",
  apiKey,
}) {
  if (mode === "word") {
    return lookupWithFreeDictionary(word);
  }

  try {
    return await lookupWithGemini({ word, workTitle, apiKey });
  } catch (error) {
    console.error(
      "Gemini failed for contextual lookup. Falling back to Free Dictionary API.",
      error?.message || error,
    );

    return lookupWithFreeDictionary(word);
  }
}

module.exports = {
  LookupError,
  lookupContext,
};

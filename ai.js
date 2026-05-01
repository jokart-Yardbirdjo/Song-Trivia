/**
 * ==============================================================================
 * YARDBIRD'S GAMES - THE LLM BRIDGE (ai.js)
 * ==============================================================================
 * Role: The universal translator for AI generation across all cartridges.
 * Responsibilities:
 * 1. Securely read the user's preferred API provider and key from localStorage.
 * 2. Accept a generic system/user prompt from any Cartridge.
 * 3. Format the payload specifically for OpenAI, Gemini, or Anthropic.
 * 4. Return a clean, standardized string (or JSON) back to the Cartridge.
 * * * Developer Note: Cartridges should NEVER import this if they don't need AI.
 * ==============================================================================
 */

/**
 * Core generation function to be called by Cartridges.
 * @param {string} systemPrompt - The behavior instructions for the AI.
 * @param {string} userPrompt - The specific request/data for this generation.
 * @param {boolean} expectJson - If true, forces the model to return a JSON object.
 * @returns {Promise<string|object>} - The generated text or parsed JSON.
 */
export async function generateAI(systemPrompt, userPrompt, expectJson = false) {
    const provider = localStorage.getItem('yardbird_ai_provider') || 'openai';
    const apiKey = localStorage.getItem('yardbird_ai_key');

    if (!apiKey) {
        throw new Error("Missing AI Key. Please add your API key in the Platform Settings (⚙️).");
    }

    console.log(`[ai.js] 🧠 Routing request to ${provider.toUpperCase()}...`);

    try {
        if (provider === 'openai') {
            return await _fetchOpenAI(apiKey, systemPrompt, userPrompt, expectJson);
        } else if (provider === 'gemini') {
            return await _fetchGemini(apiKey, systemPrompt, userPrompt, expectJson);
        } else if (provider === 'claude') {
            return await _fetchClaude(apiKey, systemPrompt, userPrompt, expectJson);
        } else {
            throw new Error("Invalid AI provider selected.");
        }
    } catch (error) {
        console.error(`[ai.js] ❌ Generation Failed:`, error);
        throw error; // Throw back to the Cartridge so it can show a UI error in #feedback-setup
    }
}

// ==========================================
// PRIVATE PROVIDER FUNCTIONS
// ==========================================

async function _fetchOpenAI(key, sys, user, json) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
            model: "gpt-4o-mini", 
            response_format: json ? { type: "json_object" } : { type: "text" },
            messages: [
                { role: "system", content: sys },
                { role: "user", content: user }
            ]
        })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    let content = data.choices[0].message.content;
    return json ? JSON.parse(content) : content;
}

async function _fetchGemini(key, sys, user, json) {
    // Gemini embeds the API key directly in the URL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    
    const payload = {
        system_instruction: {
            parts: { text: sys }
        },
        contents: [{
            parts: [{ text: user }]
        }],
        generationConfig: {
            // Gemini 1.5 supports strict JSON formatting natively
            response_mime_type: json ? "application/json" : "text/plain"
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let content = data.candidates[0].content.parts[0].text;
    return json ? JSON.parse(content) : content;
}

async function _fetchClaude(key, sys, user, json) {
    // Claude does not have a strict JSON mode setting, so we append the instruction to the system prompt
    let finalSys = sys;
    if (json) finalSys += "\n\nCRITICAL: You must return ONLY valid, minified JSON. Do not include markdown formatting or conversational text.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true" // Required for client-side fetch
        },
        body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 1500,
            system: finalSys,
            messages: [
                { role: "user", content: user }
            ]
        })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let content = data.content[0].text;
    return json ? JSON.parse(content) : content;
}

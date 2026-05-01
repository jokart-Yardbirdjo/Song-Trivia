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
    const provider = localStorage.getItem('yardbird_ai_provider');
    const apiKey = localStorage.getItem('yardbird_ai_key');

    if (!provider || !apiKey) {
        throw new Error("Missing AI configuration. Please add your API key in the Settings menu.");
    }

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
        throw error; // Throw back to the Cartridge so it can show a UI error
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
            model: "gpt-4o-mini", // Fast, cheap, perfect for games
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

// (Stubs for Gemini and Claude to be built out once we confirm the architecture)
async function _fetchGemini(key, sys, user, json) {
    // TODO: Implement Google Gemini REST API call
    throw new Error("Gemini integration coming soon.");
}

async function _fetchClaude(key, sys, user, json) {
    // TODO: Implement Anthropic Claude REST API call
    throw new Error("Claude integration coming soon.");
}
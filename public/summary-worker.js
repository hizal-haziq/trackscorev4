/**
 * Ephemeral Web Worker for Quantized Transformers.js In-Browser Summarization
 * Automatically terminated immediately upon response to free WebAssembly RAM.
 */

self.onmessage = async (e) => {
  const { id, type, text, max_new_tokens = 40, min_length = 10 } = e.data || {};
  if (type !== 'summarize' || !text) {
    self.postMessage({ id, type: 'error', error: 'Invalid summarization request payload.' });
    return;
  }

  try {
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0');

    // Prevent per-core WASM buffer duplication to maintain low memory profile
    if (env?.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
    }
    if (env) {
      env.allowLocalModels = false;
    }

    const summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6', { quantized: true });
    const output = await summarizer(text, {
      max_new_tokens,
      min_length
    });

    const summary = Array.isArray(output) && output[0]?.summary_text ? output[0].summary_text.trim() : null;
    self.postMessage({ id, type: 'success', summary });
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err.message || String(err) });
  }
};


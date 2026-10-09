/**
 * TrackScore Peer Commentary & Client-Side AI Summarization Engine
 * Powered by Transformers.js (Xenova/distilbart-cnn-6-6) running in the browser.
 * Zero backend serverless cost, zero API timeouts.
 */

(function (window) {
  /**
   * Ephemeral Web Worker runner for client-side quantized summarization.
   * Only instantiated on-demand when text >= 80 chars.
   * Calls worker.terminate() immediately upon response or timeout to release WASM memory.
   */
  function runEphemeralWorkerSummarization(text, options = {}, onProgress) {
    return new Promise((resolve) => {
      const cleanText = (text || '').trim();
      if (cleanText.length < 80) {
        return resolve(null);
      }

      let worker = null;
      let timer = null;
      let isSettled = false;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (worker) {
          try {
            worker.terminate();
          } catch (_) {}
          worker = null;
        }
      };

      const finish = (result) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        resolve(result);
      };

      timer = setTimeout(() => {
        console.warn('[AI-SUMMARIZER] Ephemeral worker summarization timed out after 15s');
        finish(null);
      }, 15000);

      try {
        if (typeof onProgress === 'function') onProgress('Initializing low-memory AI worker...');
        
        // Instantiate dedicated Web Worker
        const workerUrl = typeof window !== 'undefined' && window.location.pathname.startsWith('/dist') 
          ? '/dist/summary-worker.js' 
          : '/summary-worker.js';
        
        try {
          worker = new Worker(workerUrl, { type: 'module' });
        } catch (_) {
          worker = new Worker('summary-worker.js', { type: 'module' });
        }

        worker.onmessage = (e) => {
          const { type, summary, error } = e.data || {};
          if (type === 'success' && summary) {
            finish(summary.trim());
          } else {
            if (error) console.warn('[AI-SUMMARIZER] Worker error:', error);
            finish(null);
          }
        };

        worker.onerror = (err) => {
          console.warn('[AI-SUMMARIZER] Worker runtime error:', err.message || err);
          finish(null);
        };

        if (typeof onProgress === 'function') onProgress('Generating summary in isolated worker...');
        worker.postMessage({
          type: 'summarize',
          text: cleanText,
          max_new_tokens: options.max_new_tokens || 40,
          min_length: options.min_length || 10
        });
      } catch (err) {
        console.warn('[AI-SUMMARIZER] Worker instantiation failed:', err.message);
        finish(null);
      }
    });
  }

  /**
   * Summarizes single comment text using an ephemeral worker
   */
  async function summarizeCommentText(text, onProgress) {
    const clean = (text || '').trim();
    if (clean.length < 80) {
      return null;
    }
    return runEphemeralWorkerSummarization(clean, { max_new_tokens: 40, min_length: 10 }, onProgress);
  }

  /**
   * Summarizes combined discussion thread using an ephemeral worker
   */
  async function summarizeOverallThread(existingComments, newCommentText, onProgress) {
    const allTexts = [];
    if (Array.isArray(existingComments)) {
      existingComments.forEach(c => {
        if (c && c.text) allTexts.push(c.text.trim());
      });
    }
    if (newCommentText && newCommentText.trim()) {
      allTexts.push(newCommentText.trim());
    }

    const combined = allTexts.join(' ');
    if (combined.length < 120) {
      return null;
    }

    return runEphemeralWorkerSummarization(combined, { max_new_tokens: 60, min_length: 15 }, onProgress);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Generates the HTML for the Peer Comments section
   */
  function renderPeerCommentsHtml(record, options = {}) {
    const comments = Array.isArray(record.comments) ? record.comments : [];
    const overallSummary = record.commentsOverallSummary || null;
    const canComment = options.canComment !== false;
    const currentUserId = options.currentUserId || '';
    const currentUserAssessorId = (options.currentUserAssessorId || '').toLowerCase();

    let overallSummaryHtml = '';
    if (overallSummary) {
      overallSummaryHtml = `
        <div style="background: linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%); border: 1px solid #A7F3D0; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: #065F46; font-size: 13.5px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Consolidated AI Discussion Summary
            </div>
            <span style="font-size: 10px; background: #D1FAE5; color: #047857; padding: 2px 7px; border-radius: 9999px; font-weight: 700; border: 1px solid #6EE7B7;">
              In-Browser Transformers.js
            </span>
          </div>
          <p style="margin: 0; font-size: 13px; color: #064E3B; line-height: 1.55;">
            ${escapeHtml(overallSummary)}
          </p>
        </div>
      `;
    }

    let commentsListHtml = '';
    if (comments.length === 0) {
      commentsListHtml = `
        <div style="text-align: center; padding: 28px 16px; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 6px; color: #64748B; font-size: 13px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.8" style="margin-bottom: 6px;">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <div>No peer commentary recorded yet.</div>
          ${canComment ? '<div style="font-size: 12px; color: #94A3B8; margin-top: 2px;">Be the first assessor or manager to provide peer feedback below.</div>' : ''}
        </div>
      `;
    } else {
      commentsListHtml = `
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px;">
          ${comments.map(c => {
            const isManager = (c.authorRole || '').toLowerCase() === 'manager';
            const roleBadgeBg = isManager ? '#EEF2FF' : '#ECFDF5';
            const roleBadgeColor = isManager ? '#4338CA' : '#065F46';
            const roleBadgeBorder = isManager ? '#C7D2FE' : '#A7F3D0';
            const roleLabel = isManager ? 'Manager Audit' : 'Peer Assessor';
            const timeFormatted = c.createdAt ? new Date(c.createdAt).toLocaleString('en-MY', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Just now';

            return `
              <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="font-weight: 700; color: #0F172A; font-size: 13.5px;">${escapeHtml(c.authorName || 'Evaluator')}</div>
                    <span style="font-size: 10.5px; font-weight: 700; background: ${roleBadgeBg}; color: ${roleBadgeColor}; border: 1px solid ${roleBadgeBorder}; padding: 1px 7px; border-radius: 4px;">
                      ${roleLabel}
                    </span>
                  </div>
                  <div style="font-size: 11.5px; color: #64748B;">${timeFormatted}</div>
                </div>

                <div style="font-size: 13.5px; color: #334155; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(c.text)}</div>

                ${c.aiSummary ? `
                  <div style="margin-top: 10px; background: #F8FAFC; border-left: 3px solid #6366F1; border-radius: 0 6px 6px 0; padding: 7px 12px; font-size: 12px; color: #3730A3;">
                    <div style="font-weight: 700; display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                      AI Key Takeaway:
                    </div>
                    <span>${escapeHtml(c.aiSummary)}</span>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    let formHtml = '';
    if (canComment) {
      formHtml = `
        <div style="background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label for="peer-comment-input" style="font-size: 13px; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F58220" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Add Peer Feedback / Commentary
            </label>
            <div style="font-size: 11px; color: #64748B;">
              <span id="peer-comment-char-count">0</span> / 1000
            </div>
          </div>

          <textarea
            id="peer-comment-input"
            rows="3"
            maxlength="1000"
            placeholder="Share technical observations, criteria verifications, or feedback (minimum 80 chars triggers client-side AI summarization)..."
            style="width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 13.5px; border: 1px solid #CBD5E1; border-radius: 6px; resize: vertical; outline: none; font-family: inherit; line-height: 1.4;"
            oninput="window.PeerCommentsEngine.handleTextareaInput(this)"
          ></textarea>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-wrap: wrap; gap: 10px;">
            <div id="peer-comment-status-text" style="font-size: 12px; color: #64748B; display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10B981;"></span>
              Browser AI summarization active (zero API cost)
            </div>

            <button
              type="button"
              id="btn-submit-peer-comment"
              class="btn btn-primary btn-sm"
              onclick="window.PeerCommentsEngine.submitCommentForm('${escapeHtml(String(record._id || record.id))}')"
              style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700; padding: 6px 16px; border-radius: 6px; background: #F58220; border-color: #EA580C;"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              <span>Post Comment</span>
            </button>
          </div>
        </div>
      `;
    } else {
      formHtml = `
        <div style="background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px 16px; margin-top: 14px; font-size: 12.5px; color: #475569; display: flex; align-items: center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <span>As the evaluating assessor for this record, peer commentary is presented in read-only audit mode. Only fellow assessors and managers can provide peer feedback.</span>
        </div>
      `;
    }

    return `
      <div id="peer-comments-container" style="margin-top: 24px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; background: #F8FAFC;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #E2E8F0;">
          <h4 style="font-size: 14.5px; font-weight: 800; color: #0F172A; margin: 0; display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F58220" stroke-width="2.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Peer Reviews &amp; Technical Commentary
          </h4>
          <span style="font-size: 11px; font-weight: 700; color: #475569; background: #E2E8F0; padding: 2px 8px; border-radius: 10px;">
            ${comments.length} ${comments.length === 1 ? 'Comment' : 'Comments'}
          </span>
        </div>

        ${overallSummaryHtml}
        ${commentsListHtml}
        ${formHtml}
      </div>
    `;
  }

  function handleTextareaInput(textarea) {
    const counter = document.getElementById('peer-comment-char-count');
    if (counter) counter.textContent = textarea.value.length;

    const statusText = document.getElementById('peer-comment-status-text');
    if (statusText) {
      if (textarea.value.trim().length >= 80) {
        statusText.innerHTML = `
          <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #6366F1;"></span>
          <span style="color: #4F46E5; font-weight: 600;">Length eligible for client AI summarization (&ge; 80 chars)</span>
        `;
      } else {
        statusText.innerHTML = `
          <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #94A3B8;"></span>
          Browser AI summarization active (${80 - textarea.value.trim().length} more chars for AI takeaway)
        `;
      }
    }
  }

  /**
   * Handles submitting the comment form with client-side AI summarization
   */
  async function submitCommentForm(evaluationId, onCommentPosted) {
    const textarea = document.getElementById('peer-comment-input');
    const submitBtn = document.getElementById('btn-submit-peer-comment');
    const statusText = document.getElementById('peer-comment-status-text');

    if (!textarea || !submitBtn) return;
    const text = textarea.value.trim();
    if (!text) {
      alert('Please enter your comment or feedback before submitting.');
      textarea.focus();
      return;
    }

    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;

    // Helper status updater
    const updateProgress = msg => {
      if (statusText) {
        statusText.innerHTML = `
          <span class="spinner-inline" style="width: 12px; height: 12px; border-width: 2px; border-color: #6366F1; border-top-color: transparent;"></span>
          <span style="color: #4F46E5; font-weight: 600;">${escapeHtml(msg)}</span>
        `;
      }
    };

    submitBtn.innerHTML = `
      <span class="spinner-inline" style="width: 13px; height: 13px; border-width: 2px; border-color: #FFF; border-top-color: transparent; margin-right: 4px;"></span>
      <span>Summarizing &amp; Posting...</span>
    `;

    try {
      // 1. Run client-side AI summarization for this comment if text >= 80 chars
      let aiSummary = null;
      if (text.length >= 80) {
        updateProgress('Generating browser-based AI summary (Transformers.js)...');
        aiSummary = await summarizeCommentText(text, updateProgress);
      }

      // 2. Fetch existing evaluation record to compute overall thread summary
      let existingComments = [];
      try {
        const getUrl = `/.netlify/functions/lookup-evaluation?id=${encodeURIComponent(evaluationId)}&peerReview=true`;
        const res = await fetch(getUrl, {
          headers: typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {}
        });
        if (res.ok) {
          const evalData = await res.json();
          const rec = evalData.data ? evalData.data[0] : (evalData.evaluation || evalData);
          if (rec && Array.isArray(rec.comments)) {
            existingComments = rec.comments;
          }
        }
      } catch (e) {
        console.warn('Failed to retrieve existing comments for thread roll-up:', e.message);
      }

      // 3. Compute overall roll-up summary if total thread length >= 120 chars
      let commentsOverallSummary = undefined;
      const combinedLength = existingComments.reduce((acc, c) => acc + (c.text?.length || 0), 0) + text.length;
      if (combinedLength >= 120) {
        updateProgress('Updating consolidated discussion thread summary...');
        const overall = await summarizeOverallThread(existingComments, text, updateProgress);
        if (overall) {
          commentsOverallSummary = overall;
        }
      }

      // 4. Update button to Posting
      submitBtn.innerHTML = `
        <span class="spinner-inline" style="width: 13px; height: 13px; border-width: 2px; border-color: #FFF; border-top-color: transparent; margin-right: 4px;"></span>
        <span>Posting...</span>
      `;
      if (statusText) {
        statusText.innerHTML = '<span style="color: #059669; font-weight: 600;">Saving comment to evaluation record...</span>';
      }

      // 5. Post to backend
      const payload = {
        evaluationId,
        text,
        aiSummary: aiSummary || null
      };
      if (commentsOverallSummary !== undefined) {
        payload.commentsOverallSummary = commentsOverallSummary;
      }

      const postRes = await fetch('/.netlify/functions/add-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {})
        },
        body: JSON.stringify(payload)
      });

      const result = await postRes.json();
      if (!postRes.ok || !result.success) {
        throw new Error(result.error || 'Failed to post comment.');
      }

      if (typeof window.showToast === 'function') {
        window.showToast('💬 Peer comment posted successfully with AI summary!');
      }

      // Clear textarea
      textarea.value = '';
      const counter = document.getElementById('peer-comment-char-count');
      if (counter) counter.textContent = '0';

      // Callback or refresh active view
      if (typeof onCommentPosted === 'function') {
        onCommentPosted(result);
      } else if (typeof window.onPeerCommentAdded === 'function') {
        window.onPeerCommentAdded(evaluationId, result);
      }
    } catch (err) {
      console.error('Error posting peer comment:', err);
      alert('Error posting comment: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      if (statusText) {
        statusText.innerHTML = `
          <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10B981;"></span>
          Browser AI summarization active (zero API cost)
        `;
      }
    }
  }

  const getSummarizerPipeline = () => runEphemeralWorkerSummarization;

  window.PeerCommentsEngine = {
    getSummarizerPipeline,
    runEphemeralWorkerSummarization,
    summarizeCommentText,
    summarizeOverallThread,
    renderPeerCommentsHtml,
    handleTextareaInput,
    submitCommentForm
  };
})(window);

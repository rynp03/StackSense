const actionButtons = document.querySelectorAll(".action-btn");
const outputBox = document.querySelector(".output-box");
const footerText = document.querySelector(".footer span");
const stackToggle = document.getElementById("stackToggle");

const improveBtn = [...actionButtons].find((btn) =>
  btn.innerText.toLowerCase().includes("improve"),
);

const resetBtn = document.getElementById("resetBtn");

resetBtn?.addEventListener("click", () => {
  outputBox.innerHTML = `
    <div class="placeholder">
      Select an action to get help
    </div>
  `;
  footerText.innerText = "";
  actionButtons.forEach((b) => {
    b.classList.remove("active");
    b.disabled = false;
  });
});
function extractNotedComments(sources) {
  const seen = new Set();
  const comments = [];

  sources.forEach((source) => {
    source.answers.forEach((ans) => {
      ans.comments.forEach((c) => {
        if (!seen.has(c)) {
          seen.add(c);
          comments.push(c);
        }
      });
    });
  });

  return comments.slice(0, 6); // keep it readable
}

function renderNotedComments(comments) {
  if (!comments.length) return;

  const html = `
    <div class="response-block">
      <div class="response-label">Noted Comments</div>
      <ul class="comments">
        ${comments.map((c) => `<li>💬 ${c}</li>`).join("")}
      </ul>
    </div>
  `;

  outputBox.innerHTML += html;
}

stackToggle.addEventListener("change", () => {
  if (!improveBtn) return;

  if (stackToggle.checked) {
    improveBtn.classList.add("disabled");
    improveBtn.disabled = true;
  } else {
    improveBtn.classList.remove("disabled");
    improveBtn.disabled = false;
  }
});

// Get page context from content script
async function getPageContext() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tab.id,
      { type: "GET_PAGE_CONTEXT" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "Content script not available:",
            chrome.runtime.lastError.message,
          );
          resolve(null);
        } else {
          resolve(response);
        }
      },
    );
  });
}

function renderStackSources(sources) {
  const html = sources
    .map(
      (source) => `
    <div class="response-block">
      <div class="response-label">Sources · Stack Overflow</div>
      <a href="${source.link}" target="_blank" class="so-link">
        🔗 ${source.title}
      </a>

      ${source.answers
        .map(
          (ans) => `
        <div class="stack-answer">
  <div class="answer-meta">
    ${(() => {
      const meta = badgeMeta(ans);
      return `
        <span class="badge ${meta.label.toLowerCase()}"
              title="${meta.tip}">
          ${meta.emoji} ${meta.label}
        </span>
      `;
    })()}

    <span class="votes" title="Community upvotes">
      👍 ${ans.votes}
    </span>

    ${
      ans.accepted
        ? `<span class="accepted" title="Accepted by question author">
             ✔ Accepted
           </span>`
        : ""
    }
  </div>

  <!-- ✅ THIS WAS MISSING -->
  <div class="answer-body markdown">
  ${marked.parse(ans.body || "_No answer content available_")}
</div>


  <ul class="comments">
    ${
      ans.comments.length
        ? ans.comments.map((c) => `<li>💬 ${c}</li>`).join("")
        : `<li class="no-comments">No notable comments</li>`
    }
  </ul>
</div>


      `,
        )
        .join("")}
    </div>
  `,
    )
    .join("");

  outputBox.innerHTML += html;
  outputBox.scrollTop = outputBox.scrollHeight;
}

function badgeMeta(ans) {
  switch (ans.badge) {
    case "GOLD":
      return {
        emoji: "🥇",
        label: "Gold",
        tip: ans.badgeReason || "Highly reliable answer",
      };
    case "SILVER":
      return {
        emoji: "🥈",
        label: "Silver",
        tip: ans.badgeReason || "Mostly correct with minor caveats",
      };
    case "BRONZE":
      return {
        emoji: "🥉",
        label: "Bronze",
        tip: ans.badgeReason || "Partially correct or incomplete",
      };
    default:
      return {
        emoji: "⚠️",
        label: "Warning",
        tip: ans.badgeReason || "Possibly incorrect or outdated",
      };
  }
}

function typeText(element, html, speed = 15, onDone) {
  element.innerHTML = "";
  const temp = document.createElement("div");
  temp.innerHTML = html;

  const text = temp.textContent || "";
  let i = 0;

  const interval = setInterval(() => {
    element.textContent += text[i];
    element.parentElement.scrollTop = element.parentElement.scrollHeight;
    i++;

    if (i >= text.length) {
      clearInterval(interval);
      element.innerHTML = html; // restore markdown
      if (onDone) onDone();
    }
  }, speed);
}

function clearActiveButtons() {
  actionButtons.forEach((btn) => btn.classList.remove("active"));
}

actionButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    // UI state
    clearActiveButtons();
    btn.classList.add("active");
    actionButtons.forEach((b) => (b.disabled = true));

    outputBox.innerHTML = `
  <div class="loader">
    <div class="dots">
      <span></span><span></span><span></span>
    </div>
    <span>Thinking</span>
  </div>
`;

    const context = await getPageContext();

    if (!context) {
      outputBox.innerHTML = "❌ No response from content script";
      footerText.innerText = "Context: unavailable";
      return;
    }

    const brainResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "PROCESS_INTENT",
          payload: {
            action: btn.innerText,
            context,
            mode: stackToggle.checked ? "STACK" : "AI",
          },
        },
        (response) => {
          resolve(response || null);
        },
      );
    });

    if (!brainResponse) {
      outputBox.innerHTML = "❌ Background brain not responding";
      return;
    }

    outputBox.innerHTML = `
  <div class="response-block">
    <div class="response-label">Intent</div>
    <div class="response-value">${brainResponse.intent}</div>
  </div>

  <div class="response-block">
    <div class="response-label">StackSense says</div>
    <div class="response-value markdown" id="aiResponse"></div>
  </div>

  ${
    brainResponse.summary
      ? `
        <div class="response-block ai-summary">
          <div class="response-label">StackSense Summary</div>
          <div class="response-value">
            ${brainResponse.summary}
          </div>
        </div>
      `
      : ""
  }
`;

    const aiEl = document.getElementById("aiResponse");

    typeText(aiEl, marked.parse(brainResponse.text), 15, () => {
      actionButtons.forEach((b) => (b.disabled = false));

      // ❌ No Stack results
      if (stackToggle.checked && !brainResponse.sources?.length) {
        outputBox.innerHTML += `
      <div class="response-block">
        <div class="response-label">Sources · Stack Overflow</div>
        <div class="response-value">No relevant Stack Overflow results found.</div>
      </div>
    `;
        return;
      }

      // ✅ Stack results
      if (brainResponse.sources?.length) {
        renderStackSources(brainResponse.sources);

        const notedComments = extractNotedComments(brainResponse.sources);
        renderNotedComments(notedComments);
      }
    });

    footerText.innerText = `Context: ${new URL(context.url).hostname}`;
  });
});

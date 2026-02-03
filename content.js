console.log("✅ StackSense content script injected on", location.href);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse({
      title: document.title,
      url: location.href,
      selection: window.getSelection()?.toString() || ""
    });
  }
});

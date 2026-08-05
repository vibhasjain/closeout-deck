/*
 * Temporary site-wide HubSpot Conversations visibility switch.
 *
 * Keep the HubSpot loader in place for tracking and keep the independent
 * HubSpot form embeds working. Only prevent the conversations launcher/panel
 * from loading or becoming visible. Remove this file's includes to restore the
 * HubSpot chat experience.
 *
 * This is deliberately separate from the first-party Design my solution
 * widget. Do not reuse these selectors or settings for the solutioner.
 */
(function () {
  'use strict';

  window.hsConversationsSettings = Object.assign(
    {},
    window.hsConversationsSettings || {},
    { loadImmediately: false }
  );

  var style = document.createElement('style');
  style.id = 'ht-hide-hubspot-conversations';
  style.textContent =
    '#hubspot-messages-iframe-container,' +
    '.hubspot-messages-iframe-container,' +
    '[data-test-id="chat-widget-iframe"] {' +
      'display: none !important;' +
      'visibility: hidden !important;' +
      'opacity: 0 !important;' +
      'pointer-events: none !important;' +
    '}';
  document.head.appendChild(style);
})();

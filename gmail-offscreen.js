chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.target !== 'gmail-offscreen') return;
  load(msg.url, msg.nonce).then(
    (data) => reply({ ok: true, ...data }),
    (e) => reply({ ok: false, error: e.message }),
  );
  return true;
});

function load(url, nonce) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    const done = (err, result) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      frame.remove();
      err ? reject(err) : resolve(result);
    };
    // A logged-out Gmail redirects to accounts.google.com, which refuses to be framed, so it surfaces only as a timeout.
    const timer = setTimeout(() => done(new Error('Gmail did not respond: check that you are signed in to mail.google.com in this browser')), 45e3);
    const onMessage = (e) => {
      if (e.source !== frame.contentWindow || e.data?.nonce !== nonce) return;
      done(e.data.error ? new Error(e.data.error) : null, { result: e.data.result, ik: e.data.ik });
    };
    addEventListener('message', onMessage);
    frame.src = url;
    document.body.append(frame);
  });
}

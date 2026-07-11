export default function PrivacyNote() {
  return (
    <details className="privacy">
      <summary>🔒 How your data is protected</summary>
      <ul>
        <li>Your raw sleep data is designed to live <strong>encrypted on a private home server</strong> — not on some company's cloud.</li>
        <li>The decryption key is stored <strong>separately in the cloud</strong>. Neither half alone means anything to an attacker.</li>
        <li>The AI never sees your screenshot's origin or anything identifying — only <strong>anonymized signals</strong>: bedtime, wake time, duration, quality.</li>
        <li>Nothing is persisted in this demo. Your screenshot is parsed and discarded.</li>
      </ul>
    </details>
  );
}

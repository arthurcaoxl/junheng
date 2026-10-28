export function MoleculeDiagram() {
  return (
    <div className="molecule-pair" aria-label="真实分子结构示意">
      <figure className="molecule-card">
        <svg viewBox="0 0 360 120" role="img" aria-label="甘氨酸结构式 H₂N—CH₂—C(=O)—OH">
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="62" y1="64" x2="100" y2="64" />
            <line x1="150" y1="64" x2="196" y2="64" />
            <line x1="218" y1="64" x2="260" y2="64" />
            <line x1="204" y1="54" x2="204" y2="30" />
            <line x1="209" y1="54" x2="209" y2="30" />
          </g>
          <g fill="currentColor" fontFamily="Arial, sans-serif" fontSize="20" textAnchor="middle">
            <text x="36" y="71">H₂N</text><text x="125" y="71">CH₂</text><text x="207" y="71">C</text><text x="207" y="24">O</text><text x="288" y="71">OH</text>
          </g>
        </svg>
        <figcaption>甘氨酸</figcaption>
      </figure>
      <figure className="molecule-card">
        <svg viewBox="0 0 660 120" role="img" aria-label="甘氨酰甘氨酸二肽结构式 H₂N—CH₂—C(=O)—NH—CH₂—C(=O)—OH">
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="55" y1="64" x2="90" y2="64" />
            <line x1="140" y1="64" x2="209" y2="64" />
            <line x1="231" y1="64" x2="252" y2="64" />
            <line x1="282" y1="64" x2="327" y2="64" />
            <line x1="377" y1="64" x2="466" y2="64" />
            <line x1="488" y1="64" x2="549" y2="64" />
            <line x1="217" y1="54" x2="217" y2="30" />
            <line x1="222" y1="54" x2="222" y2="30" />
            <line x1="474" y1="54" x2="474" y2="30" />
            <line x1="479" y1="54" x2="479" y2="30" />
          </g>
          <g fill="currentColor" fontFamily="Arial, sans-serif" fontSize="19" textAnchor="middle">
            <text x="30" y="71">H₂N</text><text x="115" y="71">CH₂</text><text x="220" y="71">C</text><text x="220" y="24">O</text><text x="267" y="71">NH</text><text x="352" y="71">CH₂</text><text x="477" y="71">C</text><text x="477" y="24">O</text><text x="570" y="71">OH</text>
          </g>
        </svg>
        <figcaption>甘氨酰甘氨酸（二肽）</figcaption>
      </figure>
      <p>结构示意，不代表产品单一分子组成。</p>
    </div>
  );
}

export function Research() {
  return (
    <section className="research section-pad" id="research" data-theme="cream" aria-labelledby="research-title">
      <div className="section-index"><span>13</span><span>RESEARCH & IDENTITY</span></div>
      <div className="research-title-wrap">
        <p className="eyebrow">研究进展与食品身份</p>
        <h2 id="research-title">用研究说话，<br />以边界立信。</h2>
        <p className="research-intro">体重管理需要结合合理饮食、适量运动与良好作息；个体情况不同，请根据自身需求选择。</p>
      </div>

      <div className="research-fact-card">
        <span className="research-card-label">RESEARCH IN PROGRESS · 研究事实</span>
        <h3>临床研究进行中</h3>
        <dl className="research-facts">
          <div><dt>项目名称</dt><dd>基于新一代信息技术探索菌衡类食品对肥胖人群的影响</dd></div>
          <div><dt>研究单位</dt><dd>四川大学华西第四医院</dd></div>
          <div><dt>科学性审查</dt><dd>经医院临床研究学术委员会审查批准（批件号 Hsy-2025043，2025-12-03）</dd></div>
          <div><dt>研究周期</dt><dd>跟踪审查频率 12 个月，研究进展以正式报告为准</dd></div>
        </dl>
        <p className="research-evidence-label">四川大学华西第四医院｜科学性审查批件 Hsy-2025043</p>
        <a className="research-evidence-button" href="/images/clinical/ethics-approval.png" target="_blank" rel="noreferrer">查看循证依据 <span aria-hidden="true">↗</span></a>
        <a className="research-doc-link" href="/images/clinical/ethics-approval.png" target="_blank" rel="noreferrer">
          <img src="/images/clinical/ethics-approval.png" alt="四川大学华西第四医院科学性审查批件" loading="lazy" decoding="async" />
          <span>查看科学性审查批件 ↗</span>
        </a>
        <p className="research-card-note">研究情况与结论以正式报告为准，本页面不将研究经历解释为疗效承诺。</p>
      </div>

      <div className="research-recruit-card">
        <span className="research-card-label">STUDY INFO · 研究信息</span>
        <h3>已完成受试者招募</h3>
        <p className="recruit-org">教育部高等学校产学研创新基金项目｜计划招募 60 人</p>
        <ul className="recruit-list">
          <li><strong>研究对象</strong>年满 18 岁、BMI ≥ 30 kg/m² 的肥胖人群</li>
          <li><strong>研究内容</strong>探索菌衡类食品对肥胖人群的影响，研究无偿、无创、无任何收费项目</li>
          <li><strong>当前进展</strong>受试者招募已结束，研究数据整理与随访进行中</li>
        </ul>
        <p className="research-card-note">本研究为独立开展的临床研究，与产品购买无关；研究进展与结论以正式报告为准。</p>
      </div>

      <div className="research-copy">
        <p className="lead">特殊膳食食品·运动营养食品</p>
        <p>不是药品，不能代替药物。明确产品身份，也明确健康管理边界。</p>
        <strong>产品信息以实物包装与正式文件为准；不承诺固定减重结果，不适时停止并寻求专业建议。</strong>
      </div>
      <div className="research-footnote"><span>NOTE 16</span><p>批件与招募信息由研究单位公开文件整理，仅作研究进展说明，不构成功效承诺或医疗建议。</p></div>
    </section>
  );
}

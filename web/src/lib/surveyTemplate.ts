export type SurveyField = {
  id: string
  type: string
  label: string
  required?: boolean
  options?: string[]
}

export const SURVEY_FORM_CSS = `
  :root {
    --survey-primary: #1677ff;
    --survey-primary-soft: #e8f1ff;
    --survey-text: #1f2329;
    --survey-muted: #646a73;
    --survey-border: #e5e8ef;
    --survey-bg: #f8fafc;
    --survey-radius: 10px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--survey-text);
    background: var(--survey-bg);
    line-height: 1.6;
    word-break: break-word;
  }
  .survey-form {
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid var(--survey-border);
    border-radius: 14px;
    padding: 28px 24px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  }
  .survey-field { margin-bottom: 20px; }
  .survey-field:last-child { margin-bottom: 0; }
  .survey-field--section {
    margin: 8px 0 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--survey-border);
  }
  .survey-section-title {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--survey-text);
  }
  .survey-label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--survey-text);
  }
  .survey-label .required {
    color: #ff4d4f;
    margin-left: 2px;
  }
  .survey-input,
  .survey-textarea,
  .survey-select {
    width: 100%;
    max-width: 100%;
    border: 1px solid var(--survey-border);
    border-radius: var(--survey-radius);
    padding: 10px 12px;
    font-size: 15px;
    color: var(--survey-text);
    background: #fff;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .survey-input:focus,
  .survey-textarea:focus,
  .survey-select:focus {
    outline: none;
    border-color: var(--survey-primary);
    box-shadow: 0 0 0 3px var(--survey-primary-soft);
  }
  .survey-textarea { min-height: 108px; resize: vertical; }
  .survey-options { display: flex; flex-direction: column; gap: 8px; }
  .survey-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--survey-border);
    border-radius: var(--survey-radius);
    background: #fafbfd;
    cursor: pointer;
  }
  .survey-file {
    border: 1.5px dashed #c5cedd;
    border-radius: var(--survey-radius);
    padding: 24px 16px;
    text-align: center;
    color: var(--survey-muted);
    background: #fbfcfe;
  }
  img, video { max-width: 100%; height: auto; }
  @media (max-width: 480px) {
    .survey-form { padding: 20px 16px; border-radius: 12px; }
  }
`

export type SurveyTemplateLabels = {
  option1: string
  option2: string
  inputPlaceholder: string
  fileUpload: string
}

const DEFAULT_LABELS: SurveyTemplateLabels = {
  option1: '选项 1',
  option2: '选项 2',
  inputPlaceholder: '请输入',
  fileUpload: '点击或拖拽上传文件',
}

function requiredMark(required?: boolean) {
  return required ? '<span class="required">*</span>' : ''
}

function renderOptions(f: SurveyField, inputType: 'radio' | 'checkbox', labels: SurveyTemplateLabels) {
  const options = f.options?.length ? f.options : [labels.option1, labels.option2]
  return `<div class="survey-options">${options
    .map(
      (o) =>
        `<label class="survey-option"><input type="${inputType}" name="${f.id}" value="${o}" data-field-id="${f.id}" data-type="${f.type}" />${o}</label>`,
    )
    .join('')}</div>`
}

export function defaultHTML(fields: SurveyField[], labels: SurveyTemplateLabels = DEFAULT_LABELS) {
  const body = fields
    .map((f) => {
      if (f.type === 'section') {
        return `<div class="survey-field survey-field--section" data-field-id="${f.id}" data-type="section"><h3 class="survey-section-title">${f.label}</h3></div>`
      }
      const label = `<label class="survey-label" data-field-id="${f.id}">${f.label}${requiredMark(f.required)}</label>`
      if (f.type === 'textarea') {
        return `<div class="survey-field">${label}<textarea class="survey-textarea" data-field-id="${f.id}" data-type="textarea" placeholder="${labels.inputPlaceholder}"></textarea></div>`
      }
      if (f.type === 'file') {
        return `<div class="survey-field">${label}<div class="survey-file" data-field-id="${f.id}" data-type="file">${labels.fileUpload}</div><input data-field-id="${f.id}" data-type="file" type="file" hidden /></div>`
      }
      if (f.type === 'select') {
        const options = f.options?.length ? f.options : [labels.option1, labels.option2]
        return `<div class="survey-field">${label}<select class="survey-select" data-field-id="${f.id}" data-type="select">${options.map((o) => `<option value="${o}">${o}</option>`).join('')}</select></div>`
      }
      if (f.type === 'radio') {
        return `<div class="survey-field">${label}${renderOptions(f, 'radio', labels)}</div>`
      }
      if (f.type === 'checkbox') {
        return `<div class="survey-field">${label}${renderOptions(f, 'checkbox', labels)}</div>`
      }
      const inputType = f.type === 'number' ? 'number' : 'text'
      return `<div class="survey-field">${label}<input class="survey-input" data-field-id="${f.id}" data-type="${f.type}" type="${inputType}" placeholder="${labels.inputPlaceholder}" /></div>`
    })
    .join('')
  return `<form class="survey-form">${body}</form>`
}

export function buildPreviewDocument(html: string, fields: SurveyField[], labels?: SurveyTemplateLabels) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${SURVEY_FORM_CSS}</style></head><body class="survey-skin">${html || defaultHTML(fields, labels)}</body></html>`
}

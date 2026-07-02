package htmlutil

import (
	"github.com/microcosm-cc/bluemonday"
)

var surveyPolicy = func() *bluemonday.Policy {
	p := bluemonday.NewPolicy()
	p.AllowElements(
		"form", "div", "span", "label", "input", "textarea", "select", "option",
		"h1", "h2", "h3", "p", "br", "ul", "ol", "li", "fieldset", "legend", "strong", "em",
	)
	p.AllowAttrs("class", "id", "for", "name", "type", "value", "placeholder", "required",
		"data-field-id", "data-type", "rows", "cols", "min", "max", "step", "pattern",
	).Globally()
	p.AllowAttrs("checked", "selected", "disabled", "readonly").OnElements("input", "option", "textarea", "select")
	return p
}()

func SanitizeSurveyHTML(html string) string {
	return surveyPolicy.Sanitize(html)
}

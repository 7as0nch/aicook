package graph

import "strings"

func LocalizeStepTitle(title string) string {
	switch strings.TrimSpace(title) {
	case "inspect_image":
		return "识别图片输入"
	case "classify_recipe":
		return "判断是否为菜谱"
	case "classification_result":
		return "分类结果"
	case "persist_recipe_draft":
		return "生成草稿并入库"
	case "text_recipe_knowledge":
		return "查询家庭知识库"
	case "text_recipe_web":
		return "补充网页检索"
	case "text_recipe_generate":
		return "生成结构化菜谱"
	case "text_recipe_validate":
		return "校验菜谱字段"
	default:
		return title
	}
}

func LocalizeStepDetail(detail string) string {
	switch strings.TrimSpace(detail) {
	case "recipe_detected":
		return "识别为菜谱流程"
	case "image is not a complete recipe flow":
		return "图片不是完整菜谱流程"
	default:
		return detail
	}
}

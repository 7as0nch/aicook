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
	case "text_recipe_recipe_query":
		return "查询家庭菜谱库"
	case "text_recipe_web":
		return "补充网页检索"
	case "web_search_check":
		return "检查网页搜索开关"
	case "web_search_execute":
		return "执行网页搜索"
	case "web_search_finalize":
		return "整理搜索结果"
	case "text_recipe_generate":
		return "生成结构化菜谱"
	case "text_recipe_validate":
		return "校验菜谱字段"
	case "doc_knowledge_vector":
		return "文档向量索引"
	case "doc_knowledge_graph":
		return "知识图谱生成"
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

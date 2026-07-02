package dashboard

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/victorking528/SurveyBox/api/internal/auth"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup, authSvc *auth.Service) {
	r.GET("/summary", authSvc.AuthRequired(), s.summary)
}

func (s *Service) summary(c *gin.Context) {
	userID := auth.UserID(c)

	var totalSurveys, activeSurveys, totalResponses, pendingShares int
	err := s.pool.QueryRow(c, `
		SELECT
			(SELECT COUNT(*) FROM surveys WHERE created_by = $1),
			(SELECT COUNT(*) FROM surveys WHERE created_by = $1 AND status = 'published'),
			(SELECT COUNT(*)
			 FROM responses r
			 JOIN shares sh ON sh.id = r.share_id
			 JOIN surveys sv ON sv.id = sh.survey_id
			 WHERE sv.created_by = $1),
			(SELECT COUNT(*)
			 FROM shares sh
			 JOIN surveys sv ON sv.id = sh.survey_id
			 WHERE sv.created_by = $1 AND sh.status IN ('pending', 'opened'))
	`, userID).Scan(&totalSurveys, &activeSurveys, &totalResponses, &pendingShares)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"total_surveys":   totalSurveys,
		"active_surveys":  activeSurveys,
		"total_responses": totalResponses,
		"pending_shares":  pendingShares,
	})
}

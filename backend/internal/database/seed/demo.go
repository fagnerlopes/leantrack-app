package seed

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"leantrack/backend/internal/database/sqlc"

	"github.com/jackc/pgx/v5/pgtype"
)

// Demo carrega um conjunto de dados de demonstração quando o banco ainda não
// tem nenhum roadmap. É idempotente: a segunda chamada — e todo deploy
// seguinte — não faz nada, então o trabalho do usuário nunca é sobrescrito.
//
// O conjunto é desenhado para que cada tela tenha o que mostrar, e em
// particular para a conta indicada por adminID: ela é dona de um roadmap (aba
// "Meus roadmaps") e colaboradora com permissão de edição em outro (aba
// "Compartilhados comigo"). Cobre os quatro status, os três estados de risco,
// cor customizada, link de épico e dependência interna.
//
// A regra de risco vive no frontend (roadmap-utils.ts) e compara a data da
// dependência externa com a data de INÍCIO da iniciativa, não com hoje:
// ext_milestone depois do início é crítico; até 14 dias antes é alerta; mais
// de 14 dias antes está no prazo. As datas abaixo seguem essa regra.
func Demo(ctx context.Context, q *sqlc.Queries, adminID int64) error {
	n, err := q.CountRoadmaps(ctx)
	if err != nil {
		return fmt.Errorf("contar roadmaps: %w", err)
	}
	if n > 0 {
		slog.Info("demo seed ignorado: já existem roadmaps", "count", n)
		return nil
	}

	y := time.Now().Year()

	anaID, err := q.EnsureDemoUser(ctx, sqlc.EnsureDemoUserParams{
		Email: "ana.souza@example.com",
		Name:  "Ana Souza",
	})
	if err != nil {
		return fmt.Errorf("criar Ana Souza: %w", err)
	}
	brunoID, err := q.EnsureDemoUser(ctx, sqlc.EnsureDemoUserParams{
		Email: "bruno.lima@example.com",
		Name:  "Bruno Lima",
	})
	if err != nil {
		return fmt.Errorf("criar Bruno Lima: %w", err)
	}

	// ── Roadmap A: do próprio admin → aba "Meus roadmaps" ──────────────
	plataforma, err := q.CreateRoadmap(ctx, sqlc.CreateRoadmapParams{
		OwnerID:     adminID,
		Name:        fmt.Sprintf("Roadmap Plataforma %d", y),
		Slug:        fmt.Sprintf("roadmap-plataforma-%d", y),
		Description: "Iniciativas de plataforma e infraestrutura do ano.",
	})
	if err != nil {
		return fmt.Errorf("criar roadmap Plataforma: %w", err)
	}

	// Risco crítico: a dependência externa só fica pronta 10 dias DEPOIS de a
	// iniciativa começar.
	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID:      plataforma.ID,
		Title:          "Migrar autenticação para SSO",
		Status:         "em-andamento",
		StartDate:      date(y, time.January, 15),
		EndDate:        date(y, time.March, 31),
		Progress:       60,
		Notes:          "Depende do realm provisionado pelo time de Segurança.",
		ExtTeam:        ptr("Segurança"),
		ExtDescription: ptr("Provisionamento do realm no Keycloak"),
		ExtMilestone:   date(y, time.January, 25),
		SortOrder:      10,
	}); err != nil {
		return fmt.Errorf("criar item SSO: %w", err)
	}

	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID: plataforma.ID,
		Title:     "Painel de métricas de uso",
		Status:    "nao-iniciado",
		StartDate: date(y, time.April, 1),
		EndDate:   date(y, time.June, 30),
		Notes:     "",
		SortOrder: 20,
	}); err != nil {
		return fmt.Errorf("criar item métricas: %w", err)
	}

	// Risco alerta: dependência pronta 7 dias antes do início.
	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID:      plataforma.ID,
		Title:          "Exportação agendada de relatórios",
		Status:         "pausado",
		StartDate:      date(y, time.May, 1),
		EndDate:        date(y, time.July, 15),
		Progress:       25,
		Notes:          "Pausado até o pipeline de agregação entrar no ar.",
		ExtTeam:        ptr("Dados"),
		ExtDescription: ptr("Pipeline de agregação noturna"),
		ExtMilestone:   date(y, time.April, 24),
		SortOrder:      30,
	}); err != nil {
		return fmt.Errorf("criar item exportação: %w", err)
	}

	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID: plataforma.ID,
		Title:     "Redesenho da tela de login",
		Status:    "concluido",
		StartDate: date(y, time.January, 5),
		EndDate:   date(y, time.February, 10),
		Progress:  100,
		Notes:     "",
		Color:     ptr("#0ea5e9"),
		SortOrder: 40,
	}); err != nil {
		return fmt.Errorf("criar item login: %w", err)
	}

	// Risco no prazo: dependência pronta 30 dias antes do início.
	apiPublica, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID:      plataforma.ID,
		Title:          "API pública v1",
		Status:         "em-andamento",
		StartDate:      date(y, time.July, 1),
		EndDate:        date(y, time.September, 30),
		Progress:       40,
		Notes:          "Gateway já disponível; falta publicar o contrato.",
		ExtTeam:        ptr("Plataforma"),
		ExtDescription: ptr("Gateway de APIs disponível"),
		ExtMilestone:   date(y, time.June, 1),
		SortOrder:      50,
		EpicUrl:        ptr("https://example.com/epicos/api-publica-v1"),
	})
	if err != nil {
		return fmt.Errorf("criar item API pública: %w", err)
	}

	// Dependência interna: só começa depois da API pública.
	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID:    plataforma.ID,
		Title:        "Onboarding guiado",
		Status:       "nao-iniciado",
		StartDate:    date(y, time.October, 1),
		EndDate:      date(y, time.December, 20),
		Notes:        "",
		DependencyID: &apiPublica.ID,
		SortOrder:    60,
	}); err != nil {
		return fmt.Errorf("criar item onboarding: %w", err)
	}

	// ── Roadmap B: da Ana, compartilhado com o admin ────────────────────
	atendimento, err := q.CreateRoadmap(ctx, sqlc.CreateRoadmapParams{
		OwnerID:     anaID,
		Name:        fmt.Sprintf("Roadmap Atendimento %d", y),
		Slug:        fmt.Sprintf("roadmap-atendimento-%d", y),
		Description: "Iniciativas de atendimento e suporte ao cliente.",
	})
	if err != nil {
		return fmt.Errorf("criar roadmap Atendimento: %w", err)
	}

	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID: atendimento.ID,
		Title:     "Central de ajuda com busca",
		Status:    "em-andamento",
		StartDate: date(y, time.February, 10),
		EndDate:   date(y, time.April, 30),
		Progress:  55,
		Notes:     "",
		SortOrder: 10,
	}); err != nil {
		return fmt.Errorf("criar item central de ajuda: %w", err)
	}

	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID: atendimento.ID,
		Title:     "Fila de chamados por prioridade",
		Status:    "nao-iniciado",
		StartDate: date(y, time.May, 1),
		EndDate:   date(y, time.July, 31),
		Notes:     "",
		Color:     ptr("#f59e0b"),
		SortOrder: 20,
	}); err != nil {
		return fmt.Errorf("criar item fila de chamados: %w", err)
	}

	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID: atendimento.ID,
		Title:     "Pesquisa de satisfação pós-atendimento",
		Status:    "concluido",
		StartDate: date(y, time.January, 2),
		EndDate:   date(y, time.February, 28),
		Progress:  100,
		Notes:     "",
		SortOrder: 30,
	}); err != nil {
		return fmt.Errorf("criar item pesquisa: %w", err)
	}

	// Segundo risco crítico: dependência 19 dias depois do início.
	if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
		RoadmapID:      atendimento.ID,
		Title:          "Integração com WhatsApp",
		Status:         "pausado",
		StartDate:      date(y, time.August, 1),
		EndDate:        date(y, time.November, 15),
		Progress:       10,
		Notes:          "Aguardando contrato com o provedor de mensageria.",
		ExtTeam:        ptr("Parcerias"),
		ExtDescription: ptr("Contrato com o provedor de mensageria"),
		ExtMilestone:   date(y, time.August, 20),
		SortOrder:      40,
	}); err != nil {
		return fmt.Errorf("criar item WhatsApp: %w", err)
	}

	// Colaboração: o admin pode editar; o Bruno só lê. Duas permissões em
	// estados diferentes, para o diálogo de compartilhamento ter o que exibir.
	if _, err := q.UpsertCollaborator(ctx, sqlc.UpsertCollaboratorParams{
		RoadmapID: atendimento.ID,
		UserID:    adminID,
		CanEdit:   true,
		CanShare:  false,
		CreatedBy: &anaID,
	}); err != nil {
		return fmt.Errorf("compartilhar com o admin: %w", err)
	}
	if _, err := q.UpsertCollaborator(ctx, sqlc.UpsertCollaboratorParams{
		RoadmapID: atendimento.ID,
		UserID:    brunoID,
		CanEdit:   false,
		CanShare:  false,
		CreatedBy: &anaID,
	}); err != nil {
		return fmt.Errorf("compartilhar com o Bruno: %w", err)
	}

	slog.Info("dados de demonstração carregados", "roadmaps", 2, "itens", 10)
	return nil
}

// date monta um pgtype.Date válido em UTC.
func date(y int, m time.Month, d int) pgtype.Date {
	return pgtype.Date{Time: time.Date(y, m, d, 0, 0, 0, 0, time.UTC), Valid: true}
}

// ptr devolve o endereço de v, para os campos anuláveis gerados pelo sqlc.
func ptr[T any](v T) *T { return &v }

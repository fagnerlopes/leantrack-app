package seed

import (
	"context"
	"testing"
)

const demoAdminEmail = "admin@example.com"

func TestDemoPopulatesAllThreeTabs(t *testing.T) {
	q := newTestQueries(t)
	ctx := context.Background()

	adminID, err := Admin(ctx, q, demoAdminEmail, "senha-inicial")
	if err != nil {
		t.Fatalf("Admin: %v", err)
	}
	if err := Demo(ctx, q, adminID); err != nil {
		t.Fatalf("Demo: %v", err)
	}

	// "Todos os roadmaps": os dois criados.
	all, err := q.CountRoadmaps(ctx)
	if err != nil {
		t.Fatalf("CountRoadmaps: %v", err)
	}
	if all != 2 {
		t.Errorf("CountRoadmaps = %d; esperado 2", all)
	}

	// "Meus roadmaps": exatamente um pertence ao admin.
	mine, err := q.ListMyRoadmaps(ctx, adminID)
	if err != nil {
		t.Fatalf("ListMyRoadmaps: %v", err)
	}
	if len(mine) != 1 {
		t.Errorf("ListMyRoadmaps = %d; esperado 1", len(mine))
	}

	// "Compartilhados comigo": exatamente um foi compartilhado com o admin.
	shared, err := q.ListSharedRoadmaps(ctx, adminID)
	if err != nil {
		t.Fatalf("ListSharedRoadmaps: %v", err)
	}
	if len(shared) != 1 {
		t.Errorf("ListSharedRoadmaps = %d; esperado 1", len(shared))
	}

	items, err := q.CountItems(ctx)
	if err != nil {
		t.Fatalf("CountItems: %v", err)
	}
	if items != 10 {
		t.Errorf("CountItems = %d; esperado 10", items)
	}
}

func TestDemoIsIdempotent(t *testing.T) {
	q := newTestQueries(t)
	ctx := context.Background()

	adminID, err := Admin(ctx, q, demoAdminEmail, "senha-inicial")
	if err != nil {
		t.Fatalf("Admin: %v", err)
	}
	if err := Demo(ctx, q, adminID); err != nil {
		t.Fatalf("primeira carga: %v", err)
	}
	if err := Demo(ctx, q, adminID); err != nil {
		t.Fatalf("segunda carga: %v", err)
	}

	roadmaps, err := q.CountRoadmaps(ctx)
	if err != nil {
		t.Fatalf("CountRoadmaps: %v", err)
	}
	if roadmaps != 2 {
		t.Errorf("CountRoadmaps = %d após duas cargas; esperado 2", roadmaps)
	}
	items, err := q.CountItems(ctx)
	if err != nil {
		t.Fatalf("CountItems: %v", err)
	}
	if items != 10 {
		t.Errorf("CountItems = %d após duas cargas; esperado 10", items)
	}
}

// TestDemoCoversEveryStatusAndRisk protege o que faz o conjunto valer: sem os
// quatro status e sem os três estados de risco, Gantt, filtros e legenda ficam
// sem o que mostrar. A regra de risco (frontend/src/roadmap-utils.ts) é
// ext_milestone - start_date em dias: > 0 crítico, entre -14 e 0 alerta,
// <= -14 no prazo.
func TestDemoCoversEveryStatusAndRisk(t *testing.T) {
	q := newTestQueries(t)
	ctx := context.Background()

	adminID, err := Admin(ctx, q, demoAdminEmail, "senha-inicial")
	if err != nil {
		t.Fatalf("Admin: %v", err)
	}
	if err := Demo(ctx, q, adminID); err != nil {
		t.Fatalf("Demo: %v", err)
	}

	roadmaps, err := q.ListRoadmaps(ctx)
	if err != nil {
		t.Fatalf("ListRoadmaps: %v", err)
	}

	statuses := map[string]int{}
	risks := map[string]int{}
	withColor, withDependency, withEpic := 0, 0, 0

	for _, rm := range roadmaps {
		items, err := q.ListItemsByRoadmap(ctx, rm.ID)
		if err != nil {
			t.Fatalf("ListItemsByRoadmap(%d): %v", rm.ID, err)
		}
		for _, it := range items {
			statuses[it.Status]++
			if it.Color != nil {
				withColor++
			}
			if it.DependencyID != nil {
				withDependency++
			}
			if it.EpicUrl != nil {
				withEpic++
			}
			if !it.ExtMilestone.Valid || !it.StartDate.Valid {
				continue
			}
			diff := it.ExtMilestone.Time.Sub(it.StartDate.Time).Hours() / 24
			switch {
			case diff > 0:
				risks["critico"]++
			case diff > -14:
				risks["alerta"]++
			default:
				risks["ok"]++
			}
		}
	}

	for _, s := range []string{"em-andamento", "nao-iniciado", "concluido", "pausado"} {
		if statuses[s] == 0 {
			t.Errorf("nenhuma iniciativa com status %q", s)
		}
	}
	for _, r := range []string{"critico", "alerta", "ok"} {
		if risks[r] == 0 {
			t.Errorf("nenhuma iniciativa com risco %q", r)
		}
	}
	if withColor == 0 {
		t.Error("nenhuma iniciativa com cor customizada")
	}
	if withDependency == 0 {
		t.Error("nenhuma iniciativa com dependência interna")
	}
	if withEpic == 0 {
		t.Error("nenhuma iniciativa com link de épico")
	}
}

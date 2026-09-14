import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../server.js';
import db from '../config/db.js';

describe('Rotas de Avaliações', () => {
  let token;
  let materialId;
  let usuarioId;

  beforeAll(async () => {
    // Setup: criar utilizador e material para testes
    const resRegisto = await request(app)
      .post('/api/register')
      .send({
        nome: 'User Avaliacoes',
        email: `avaliacoes-${Date.now()}@test.com`,
        senha: 'Teste123',
        curso: 'Geral',
      });

    usuarioId = resRegisto.body.id;

    // Simular login
    const resLogin = await request(app)
      .post('/api/login')
      .send({
        email: `avaliacoes-${Date.now()}@test.com`,
        senha: 'Teste123',
      });

    token = resLogin.body.token;
  });

  afterAll(async () => {
    await db.end();
    server.close();
  });

  it('POST /api/materiais/:id/avaliacoes - Submeter avaliação', async () => {
    const res = await request(app)
      .post('/api/materiais/1/avaliacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nota: 5,
        comentario: 'Excelente material!',
      });

    expect(res.status).toBe(201);
    expect(res.body.mensagem).toContain('sucesso');
  });

  it('GET /api/materiais/:id/avaliacoes - Listar avaliações', async () => {
    const res = await request(app)
      .get('/api/materiais/1/avaliacoes');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.avaliacoes)).toBe(true);
    expect(res.body.estatisticas).toBeDefined();
  });

  it('DELETE /api/materiais/:id/avaliacoes - Remover avaliação', async () => {
    // Primeiro criar uma avaliação
    await request(app)
      .post('/api/materiais/1/avaliacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nota: 4, comentario: 'Bom' });

    // Depois remover
    const res = await request(app)
      .delete('/api/materiais/1/avaliacoes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.mensagem).toContain('removido');
  });

  it('GET /api/materiais/:id/minha-avaliacao - Verificar nota inválida', async () => {
    const res = await request(app)
      .post('/api/materiais/1/avaliacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nota: 6, // Acima do máximo
        comentario: 'Teste',
      });

    expect(res.status).toBe(400);
  });
});

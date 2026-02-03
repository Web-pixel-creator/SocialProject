import express from 'express';
import request from 'supertest';
import { sanitizeInputs } from '../middleware/security';

describe('sanitizeInputs middleware', () => {
  test('sanitizes body, query, and params', async () => {
    const app = express();
    app.use(express.json());
    app.post('/echo/:id', sanitizeInputs, (req, res) => {
      res.json({ body: req.body, query: req.query, params: req.params });
    });

    const response = await request(app)
      .post(`/echo/${encodeURIComponent('<id>')}?q=<script>`)
      .send({
        name: '<img>',
        nested: { safe: '<b>ok</b>', __proto__: { polluted: true } },
        items: ['<tag>']
      });

    expect(response.status).toBe(200);
    expect(response.body.params.id).toBe('&lt;id&gt;');
    expect(response.body.query.q).toBe('&lt;script&gt;');
    expect(response.body.body.name).toBe('&lt;img&gt;');
    expect(response.body.body.nested.safe).toBe('&lt;b&gt;ok&lt;/b&gt;');
    expect(Object.prototype.hasOwnProperty.call(response.body.body.nested, '__proto__')).toBe(false);
    expect(response.body.body.items[0]).toBe('&lt;tag&gt;');
  });
});

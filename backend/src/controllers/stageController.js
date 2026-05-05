const db = require('../config/database');

const updateStage = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { projectId, stageNumber } = req.params;
    const { status, assigned_to, assigned_to_name, comments, delay_reason } = req.body;

    const stageResult = await client.query(
      'SELECT * FROM project_stages WHERE project_id = ? AND stage_number = ?',
      [projectId, stageNumber]
    );
    if (!stageResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Stage not found' });
    }

    const oldStage = stageResult.rows[0];
    const setClauses = [`updated_at = datetime('now')`];
    const params = [];

    if (status && status !== oldStage.status) {
      setClauses.push('status = ?'); params.push(status);
      if (status === 'in_progress' && !oldStage.start_time) {
        setClauses.push("start_time = datetime('now')");
      }
      if (status === 'completed') {
        setClauses.push("end_time = datetime('now')");
      }
    }
    if (assigned_to !== undefined) { setClauses.push('assigned_to = ?'); params.push(assigned_to || null); }
    if (assigned_to_name !== undefined) { setClauses.push('assigned_to_name = ?'); params.push(assigned_to_name || null); }
    if (comments !== undefined) { setClauses.push('comments = ?'); params.push(comments); }
    if (delay_reason !== undefined) { setClauses.push('delay_reason = ?'); params.push(delay_reason); }

    params.push(projectId, parseInt(stageNumber));
    await client.query(
      `UPDATE project_stages SET ${setClauses.join(', ')} WHERE project_id = ? AND stage_number = ?`,
      params
    );

    const updated = await client.query(
      'SELECT * FROM project_stages WHERE project_id = ? AND stage_number = ?',
      [projectId, stageNumber]
    );

    if (status === 'completed') {
      const nextStageNum = parseInt(stageNumber) + 1;
      if (nextStageNum <= 19) {
        await client.query(
          "UPDATE project_stages SET status = 'in_progress', start_time = datetime('now') WHERE project_id = ? AND stage_number = ?",
          [projectId, nextStageNum]
        );
      }

      const progressPct = Math.round((parseInt(stageNumber) / 19) * 100);
      const projectStatus = parseInt(stageNumber) === 19 ? 'completed' : 'active';
      await client.query(
        `UPDATE projects SET current_stage = ?, progress_percentage = ?, status = ?, actual_end_date = ?, updated_at = datetime('now') WHERE id = ?`,
        [nextStageNum > 19 ? 19 : nextStageNum, progressPct, projectStatus,
         projectStatus === 'completed' ? new Date().toISOString() : null, projectId]
      );

      // Notify assigned user for next stage
      if (nextStageNum <= 19) {
        const nextStage = await client.query(
          'SELECT * FROM project_stages WHERE project_id = ? AND stage_number = ?',
          [projectId, nextStageNum]
        );
        if (nextStage.rows[0]?.assigned_to) {
          const proj = await client.query('SELECT project_number FROM projects WHERE id = ?', [projectId]);
          await client.query(
            `INSERT INTO notifications (user_id, project_id, title, message, type) VALUES (?, ?, ?, ?, 'stage_update')`,
            [nextStage.rows[0].assigned_to, projectId, 'New Stage Assigned',
             `Stage ${nextStageNum} is now active for project ${proj.rows[0]?.project_number}`]
          );
        }
      }
    }

    await client.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address) VALUES (?, 'STAGE_UPDATED', 'stage', ?, ?, ?)",
      [req.user.id, updated.rows[0]?.id, JSON.stringify({ status }), req.ip]
    );

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update stage error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const getStages = async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await db.query(
      `SELECT ps.*, u.full_name as assigned_to_name,
         (SELECT COUNT(*) FROM documents WHERE stage_id = ps.id) as doc_count
       FROM project_stages ps
       LEFT JOIN users u ON ps.assigned_to = u.id
       WHERE ps.project_id = ? ORDER BY ps.stage_number`,
      [projectId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get stages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { updateStage, getStages };

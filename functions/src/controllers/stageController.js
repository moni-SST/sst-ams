const { db, docToObj, snapshotToArr, now, logAudit } = require('../config/firebase');

const getStages = async (req, res) => {
  try {
    const { projectId } = req.params;
    const snap = await db.collection('project_stages').where('project_id', '==', projectId).orderBy('stage_number').get();
    const stages = snapshotToArr(snap);

    const userIds = [...new Set(stages.map(s => s.assigned_to).filter(Boolean))];
    const userDocs = await Promise.all(userIds.map(id => db.collection('users').doc(id).get()));
    const userMap = {};
    userDocs.forEach(d => { if (d.exists) userMap[d.id] = d.data().full_name; });

    const docSnap = await db.collection('documents').where('project_id', '==', projectId).get();
    const docCount = {};
    snapshotToArr(docSnap).forEach(d => {
      if (d.stage_id) docCount[d.stage_id] = (docCount[d.stage_id] || 0) + 1;
    });

    stages.forEach(s => {
      s.assigned_to_name = userMap[s.assigned_to] || null;
      s.doc_count = docCount[s.id] || 0;
    });

    res.json(stages);
  } catch (err) {
    console.error('Get stages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateStage = async (req, res) => {
  try {
    const { projectId, stageNumber } = req.params;
    const { status, assigned_to, assigned_to_name, comments, delay_reason } = req.body;

    const stageSnap = await db.collection('project_stages')
      .where('project_id', '==', projectId)
      .where('stage_number', '==', parseInt(stageNumber))
      .limit(1).get();

    if (stageSnap.empty) return res.status(404).json({ error: 'Stage not found' });

    const stageRef = stageSnap.docs[0].ref;
    const oldStage = docToObj(stageSnap.docs[0]);
    const updates = { updated_at: now() };

    if (status && status !== oldStage.status) {
      updates.status = status;
      if (status === 'in_progress' && !oldStage.start_time) updates.start_time = new Date().toISOString();
      if (status === 'completed') updates.end_time = new Date().toISOString();
    }
    if (assigned_to !== undefined) updates.assigned_to = assigned_to || null;
    if (assigned_to_name !== undefined) updates.assigned_to_name = assigned_to_name || null;
    if (comments !== undefined) updates.comments = comments;
    if (delay_reason !== undefined) updates.delay_reason = delay_reason;

    await stageRef.update(updates);

    // If stage completed, advance project
    if (status === 'completed') {
      const nextStageNum = parseInt(stageNumber) + 1;
      const progressPct = Math.round((parseInt(stageNumber) / 19) * 100);
      const projectStatus = parseInt(stageNumber) === 19 ? 'completed' : 'active';

      const projectUpdates = {
        current_stage: nextStageNum > 19 ? 19 : nextStageNum,
        progress_percentage: progressPct,
        status: projectStatus,
        actual_end_date: projectStatus === 'completed' ? new Date().toISOString() : null,
        updated_at: now()
      };
      await db.collection('projects').doc(projectId).update(projectUpdates);

      // Start next stage
      if (nextStageNum <= 19) {
        const nextSnap = await db.collection('project_stages')
          .where('project_id', '==', projectId)
          .where('stage_number', '==', nextStageNum)
          .limit(1).get();
        if (!nextSnap.empty) {
          await nextSnap.docs[0].ref.update({ status: 'in_progress', start_time: new Date().toISOString(), updated_at: now() });

          // Notify assigned user
          const nextStage = docToObj(nextSnap.docs[0]);
          if (nextStage.assigned_to) {
            const projDoc = await db.collection('projects').doc(projectId).get();
            const projNum = projDoc.exists ? projDoc.data().project_number : projectId;
            await db.collection('notifications').add({
              user_id: nextStage.assigned_to, project_id: projectId,
              title: 'New Stage Assigned',
              message: `Stage ${nextStageNum} is now active for project ${projNum}`,
              type: 'stage_update', is_read: false, created_at: now()
            });
          }
        }
      }
    }

    await logAudit(req.user.id, 'STAGE_UPDATED', 'stage', oldStage.id, { status }, req.ip);

    const updatedDoc = await stageRef.get();
    res.json(docToObj(updatedDoc));
  } catch (err) {
    console.error('Update stage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getStages, updateStage };

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const OVERVIEW_DAYS = 60;
const DEFAULT_HISTORY_DAYS = 90;
const DEFAULT_RETENTION_DAYS = 365;

function getRetentionDays() {
  const value = Number.parseInt(process.env.HISTORY_RETENTION_DAYS || '', 10);
  if (!Number.isInteger(value) || value < 30) return DEFAULT_RETENTION_DAYS;
  return Math.min(value, 3650);
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function cleanIdentifier(value, maxLength = 120) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function cleanText(value, maxLength = 200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function hashCancelCode(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function isAdminCancelCode(value) {
  const adminCode = process.env.ADMIN_CANCEL_CODE;
  return Boolean(adminCode) && value === adminCode;
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysString(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateToDayNumber(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function toSlot(dateString, hour) {
  return dateToDayNumber(dateString) * 24 + Number(hour);
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatReservationRange(item) {
  const endDate = item.end_date || item.reservation_date;
  if (item.reservation_date === endDate) {
    return `${item.reservation_date} ${formatHour(item.start_hour)}-${formatHour(item.end_hour)}`;
  }
  return `${item.reservation_date} ${formatHour(item.start_hour)} 至 ${endDate} ${formatHour(item.end_hour)}`;
}

function reservationSelectFields() {
  return [
    'id',
    'status',
    'reserver_name',
    'contact',
    'reservation_date',
    'end_date',
    'start_hour',
    'end_hour',
    'purpose',
    'created_at',
    'canceled_at',
    'feedback_instrument_ok',
    'feedback_backpressure_released',
    'feedback_hydrogen_shutdown',
    'feedback_note',
    'feedback_submitted_at',
    'issue_resolved',
    'issue_resolved_at'
  ].join(', ');
}

function hasReportedIssue(item) {
  if (!item.feedback_submitted_at) return false;
  const note = cleanText(item.feedback_note, 800);
  return item.feedback_instrument_ok === false
    || item.feedback_backpressure_released === false
    || item.feedback_hydrogen_shutdown === false
    || Boolean(note);
}

async function cleanupOldReservations() {
  const cutoff = addDaysString(todayString(), -getRetentionDays());
  // 预约记录会保存在 Supabase，而不是 Vercel；这里做轻量自动清理，避免历史记录无限增长。
  // 清理失败不影响正常预约功能。
  await supabaseAdmin
    .from('reservations')
    .delete()
    .lt('end_date', cutoff);
}

export async function GET(request) {
  await cleanupOldReservations().catch(() => null);

  const { searchParams } = new URL(request.url);
  const selectedDate = searchParams.get('date');
  const view = searchParams.get('view');

  if (view === 'issues') {
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select(reservationSelectFields())
      .eq('issue_resolved', false)
      .not('feedback_submitted_at', 'is', null)
      .order('feedback_submitted_at', { ascending: false })
      .limit(80);

    if (error) {
      return Response.json({ error: '读取异常反馈失败，请稍后再试。' }, { status: 500 });
    }

    return Response.json({ issues: (data || []).filter(hasReportedIssue) });
  }

  if (view === 'history') {
    const today = todayString();
    const from = isValidDateString(searchParams.get('from'))
      ? searchParams.get('from')
      : addDaysString(today, -DEFAULT_HISTORY_DAYS);
    const to = isValidDateString(searchParams.get('to'))
      ? searchParams.get('to')
      : today;
    const keyword = cleanText(searchParams.get('q') || '', 60).toLowerCase();

    if (to < from) {
      return Response.json({ error: '历史查询的结束日期不能早于开始日期。' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select(reservationSelectFields())
      .lte('reservation_date', to)
      .gte('end_date', from)
      .order('reservation_date', { ascending: false })
      .order('start_hour', { ascending: false })
      .limit(500);

    if (error) {
      return Response.json({ error: '读取历史预约失败，请稍后再试。' }, { status: 500 });
    }

    const rows = keyword
      ? (data || []).filter((item) => [
          item.reserver_name,
          item.contact,
          item.purpose,
          item.feedback_note
        ].some((value) => String(value || '').toLowerCase().includes(keyword)))
      : (data || []);

    return Response.json({ history: rows, retentionDays: getRetentionDays() });
  }

  let query = supabaseAdmin
    .from('reservations')
    .select(reservationSelectFields())
    .eq('status', 'active')
    .order('reservation_date', { ascending: true })
    .order('start_hour', { ascending: true });

  if (selectedDate && isValidDateString(selectedDate)) {
    // 读取与这一天有重叠的预约。这样跨多日的长期测试也会出现在每天的时间轴中。
    query = query.lte('reservation_date', selectedDate).gte('end_date', selectedDate);
  } else {
    const start = todayString();
    const end = addDaysString(start, OVERVIEW_DAYS);
    // 读取未来一段时间内“仍然会占用仪器”的预约，包括已经开始但尚未结束的多日预约。
    query = query.gte('end_date', start).lte('reservation_date', end).limit(160);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: '读取预约失败，请稍后再试。' }, { status: 500 });
  }

  return Response.json({ reservations: data ?? [] });
}

export async function POST(request) {
  await cleanupOldReservations().catch(() => null);

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '提交内容格式错误。' }, { status: 400 });
  }

  const reserverName = cleanText(body.reserverName, 50);
  const contact = cleanText(body.contact, 80);
  const purpose = cleanText(body.purpose, 200);
  const cancelCode = cleanText(body.cancelCode, 60);
  const reservationDate = cleanText(body.reservationDate || body.startDate, 10);
  const endDate = cleanText(body.endDate || reservationDate, 10);
  const startHour = Number(body.startHour);
  const endHour = Number(body.endHour);

  if (!reserverName) {
    return Response.json({ error: '请填写预约人姓名。' }, { status: 400 });
  }

  if (!cancelCode || cancelCode.length < 4) {
    return Response.json({ error: '请设置至少 4 位的取消密码。之后取消预约时需要使用。' }, { status: 400 });
  }

  if (!isValidDateString(reservationDate) || !isValidDateString(endDate)) {
    return Response.json({ error: '请选择正确的开始日期和结束日期。' }, { status: 400 });
  }

  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24) {
    return Response.json({ error: '请选择正确的开始和结束时间。' }, { status: 400 });
  }

  const newStartSlot = toSlot(reservationDate, startHour);
  const newEndSlot = toSlot(endDate, endHour);

  if (newEndSlot <= newStartSlot) {
    return Response.json({ error: '结束时间必须晚于开始时间。长期测试时，请把结束日期改为后续日期。' }, { status: 400 });
  }

  // 先做一次普通冲突检查，给用户更友好的提示；数据库里还有最终防重叠约束兜底。
  const { data: candidates, error: conflictError } = await supabaseAdmin
    .from('reservations')
    .select('id, reserver_name, reservation_date, end_date, start_hour, end_hour')
    .eq('status', 'active')
    .lte('reservation_date', endDate)
    .gte('end_date', reservationDate);

  if (conflictError) {
    return Response.json({ error: '检查预约冲突失败，请稍后再试。' }, { status: 500 });
  }

  const conflict = (candidates || []).find((item) => {
    const itemStart = toSlot(item.reservation_date, item.start_hour);
    const itemEnd = toSlot(item.end_date || item.reservation_date, item.end_hour);
    return itemStart < newEndSlot && itemEnd > newStartSlot;
  });

  if (conflict) {
    return Response.json({
      error: `该时间段与 ${conflict.reserver_name} 的预约冲突：${formatReservationRange(conflict)}。`
    }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .insert({
      status: 'active',
      reserver_name: reserverName,
      contact,
      reservation_date: reservationDate,
      end_date: endDate,
      start_hour: startHour,
      end_hour: endHour,
      purpose,
      cancel_code_hash: hashCancelCode(cancelCode)
    })
    .select(reservationSelectFields())
    .single();

  if (error) {
    const message = error.code === '23P01'
      ? '该时间段刚刚被别人预约，请刷新后重新选择。'
      : '创建预约失败，请检查数据库配置。';
    return Response.json({ error: message }, { status: error.code === '23P01' ? 409 : 500 });
  }

  return Response.json({ reservation: data }, { status: 201 });
}

async function findReservationForCancel(body) {
  const reservationId = cleanIdentifier(body.id);

  // 优先按数据库主键查找。这里不再强制要求 UUID，因为部分 Supabase 表可能是手动创建的自增数字 id。
  if (reservationId) {
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('id, status, cancel_code_hash, reserver_name, reservation_date, end_date, start_hour, end_hour')
      .eq('id', reservationId)
      .maybeSingle();

    if (!error && data) return { reservation: data, error: null };

    // 如果 id 类型与数据库不一致，继续用预约时间信息兜底查找，而不是直接报“编号错误”。
    if (error && error.code !== '22P02') {
      return { reservation: null, error };
    }
  }

  const reservationDate = cleanText(body.reservationDate || body.reservation_date, 10);
  const endDate = cleanText(body.endDate || body.end_date || reservationDate, 10);
  const reserverName = cleanText(body.reserverName || body.reserver_name, 50);
  const startHour = Number(body.startHour ?? body.start_hour);
  const endHour = Number(body.endHour ?? body.end_hour);

  if (!isValidDateString(reservationDate) || !isValidDateString(endDate)
    || !Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    return {
      reservation: null,
      error: { message: '预约记录信息不完整，请刷新页面后再尝试取消。' }
    };
  }

  let query = supabaseAdmin
    .from('reservations')
    .select('id, status, cancel_code_hash, reserver_name, reservation_date, end_date, start_hour, end_hour')
    .eq('reservation_date', reservationDate)
    .eq('end_date', endDate)
    .eq('start_hour', startHour)
    .eq('end_hour', endHour)
    .limit(5);

  if (reserverName) {
    query = query.eq('reserver_name', reserverName);
  }

  const { data, error } = await query;
  if (error) return { reservation: null, error };

  return { reservation: data?.[0] || null, error: null };
}

export async function DELETE(request) {
  await cleanupOldReservations().catch(() => null);

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '提交内容格式错误。' }, { status: 400 });
  }

  const cancelCode = cleanText(body.cancelCode, 60);

  if (!cancelCode) {
    return Response.json({ error: '请输入取消密码。' }, { status: 400 });
  }

  const { reservation, error: readError } = await findReservationForCancel(body);

  if (readError) {
    return Response.json({ error: readError.message || '读取预约信息失败，请稍后再试。' }, { status: 500 });
  }

  if (!reservation || reservation.status === 'canceled') {
    return Response.json({ error: '该预约不存在，可能已经被取消。请刷新页面后再确认。' }, { status: 404 });
  }

  const adminMatched = isAdminCancelCode(cancelCode);
  const codeMatched = reservation.cancel_code_hash
    ? reservation.cancel_code_hash === hashCancelCode(cancelCode)
    : false;

  if (!reservation.cancel_code_hash && !adminMatched) {
    return Response.json({
      error: '这条预约没有保存取消密码，可能是旧版本系统创建的预约。请联系管理员使用管理员取消密码处理。'
    }, { status: 403 });
  }

  if (!codeMatched && !adminMatched) {
    return Response.json({ error: '取消密码不正确，无法取消该预约。' }, { status: 403 });
  }

  const { error: cancelError } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('id', cleanIdentifier(reservation.id));

  if (cancelError) {
    return Response.json({ error: '取消预约失败，请稍后再试。' }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function PATCH(request) {
  await cleanupOldReservations().catch(() => null);

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '提交内容格式错误。' }, { status: 400 });
  }

  const action = cleanText(body.action, 30);
  const reservationId = cleanIdentifier(body.id);

  if (!reservationId) {
    return Response.json({ error: '缺少预约编号，请刷新页面后再试。' }, { status: 400 });
  }

  if (action === 'feedback') {
    const instrumentOk = body.instrumentOk;
    const backpressureReleased = body.backpressureReleased;
    const hydrogenShutdown = body.hydrogenShutdown;
    const feedbackNote = cleanText(body.feedbackNote, 800);

    if (typeof instrumentOk !== 'boolean' || typeof backpressureReleased !== 'boolean' || typeof hydrogenShutdown !== 'boolean') {
      return Response.json({ error: '请完整回答三个仪器状态问题。' }, { status: 400 });
    }

    const issueDetected = !instrumentOk || !backpressureReleased || !hydrogenShutdown || Boolean(feedbackNote);

    const { data: reservation, error: readError } = await supabaseAdmin
      .from('reservations')
      .select('id, status')
      .eq('id', reservationId)
      .maybeSingle();

    if (readError) {
      return Response.json({ error: '读取预约失败，请稍后再试。' }, { status: 500 });
    }

    if (!reservation) {
      return Response.json({ error: '预约记录不存在，请刷新页面后再试。' }, { status: 404 });
    }

    if (reservation.status === 'canceled') {
      return Response.json({ error: '已取消的预约不能提交使用反馈。' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({
        feedback_instrument_ok: instrumentOk,
        feedback_backpressure_released: backpressureReleased,
        feedback_hydrogen_shutdown: hydrogenShutdown,
        feedback_note: feedbackNote,
        feedback_submitted_at: new Date().toISOString(),
        issue_resolved: !issueDetected,
        issue_resolved_at: null
      })
      .eq('id', reservationId)
      .select(reservationSelectFields())
      .single();

    if (error) {
      return Response.json({ error: '提交反馈失败，请稍后再试。' }, { status: 500 });
    }

    return Response.json({ reservation: data, issueDetected });
  }

  if (action === 'resolveIssue') {
    const resolveCode = cleanText(body.resolveCode, 80);

    if (!process.env.ADMIN_CANCEL_CODE) {
      return Response.json({ error: '尚未设置管理员处理密码。请先在 Vercel 环境变量中设置 ADMIN_CANCEL_CODE。' }, { status: 500 });
    }

    if (!isAdminCancelCode(resolveCode)) {
      return Response.json({ error: '管理员处理密码不正确，无法关闭异常提示。' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({ issue_resolved: true, issue_resolved_at: new Date().toISOString() })
      .eq('id', reservationId)
      .select(reservationSelectFields())
      .single();

    if (error) {
      return Response.json({ error: '关闭异常提示失败，请稍后再试。' }, { status: 500 });
    }

    return Response.json({ reservation: data });
  }

  return Response.json({ error: '未知操作。' }, { status: 400 });
}

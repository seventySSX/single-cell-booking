import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function cleanText(value, maxLength = 200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const selectedDate = searchParams.get('date');

  let query = supabaseAdmin
    .from('reservations')
    .select('id, reserver_name, contact, reservation_date, start_hour, end_hour, purpose, created_at')
    .order('reservation_date', { ascending: true })
    .order('start_hour', { ascending: true });

  if (selectedDate && isValidDateString(selectedDate)) {
    query = query.eq('reservation_date', selectedDate);
  } else {
    const today = new Date();
    const start = today.toISOString().slice(0, 10);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    const end = endDate.toISOString().slice(0, 10);
    query = query.gte('reservation_date', start).lte('reservation_date', end).limit(80);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: '读取预约失败，请稍后再试。' }, { status: 500 });
  }

  return Response.json({ reservations: data ?? [] });
}

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '提交内容格式错误。' }, { status: 400 });
  }

  const reserverName = cleanText(body.reserverName, 50);
  const contact = cleanText(body.contact, 80);
  const purpose = cleanText(body.purpose, 200);
  const reservationDate = cleanText(body.reservationDate, 10);
  const startHour = Number(body.startHour);
  const endHour = Number(body.endHour);

  if (!reserverName) {
    return Response.json({ error: '请填写预约人姓名。' }, { status: 400 });
  }

  if (!isValidDateString(reservationDate)) {
    return Response.json({ error: '请选择正确的日期。' }, { status: 400 });
  }

  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24 || endHour <= startHour) {
    return Response.json({ error: '请选择正确的开始和结束时间。' }, { status: 400 });
  }

  // 先做一次普通冲突检查，给用户更友好的提示。
  const { data: conflicts, error: conflictError } = await supabaseAdmin
    .from('reservations')
    .select('id, reserver_name, start_hour, end_hour')
    .eq('reservation_date', reservationDate)
    .lt('start_hour', endHour)
    .gt('end_hour', startHour);

  if (conflictError) {
    return Response.json({ error: '检查预约冲突失败，请稍后再试。' }, { status: 500 });
  }

  if (conflicts && conflicts.length > 0) {
    const c = conflicts[0];
    return Response.json({
      error: `该时间段已被 ${c.reserver_name} 预约：${String(c.start_hour).padStart(2, '0')}:00-${String(c.end_hour).padStart(2, '0')}:00。`
    }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .insert({
      reserver_name: reserverName,
      contact,
      reservation_date: reservationDate,
      start_hour: startHour,
      end_hour: endHour,
      purpose
    })
    .select('id, reserver_name, contact, reservation_date, start_hour, end_hour, purpose, created_at')
    .single();

  if (error) {
    const message = error.code === '23P01'
      ? '该时间段刚刚被别人预约，请刷新后重新选择。'
      : '创建预约失败，请检查数据库配置。';
    return Response.json({ error: message }, { status: error.code === '23P01' ? 409 : 500 });
  }

  return Response.json({ reservation: data }, { status: 201 });
}

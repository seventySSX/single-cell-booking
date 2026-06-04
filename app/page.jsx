'use client';

import { useEffect, useMemo, useState } from 'react';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 7); // 7:00 - 24:00，可按需修改

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });
}

function dateToDayNumber(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function toSlot(dateString, hour) {
  return dateToDayNumber(dateString) * 24 + Number(hour);
}

function isMultiDay(reservation) {
  return reservation.end_date && reservation.end_date !== reservation.reservation_date;
}

function formatReservationRange(reservation) {
  const endDate = reservation.end_date || reservation.reservation_date;
  if (reservation.reservation_date === endDate) {
    return `${formatHour(reservation.start_hour)} - ${formatHour(reservation.end_hour)}`;
  }
  return `${formatDateLabel(reservation.reservation_date)} ${formatHour(reservation.start_hour)} - ${formatDateLabel(endDate)} ${formatHour(reservation.end_hour)}`;
}

function groupByDate(reservations) {
  return reservations.reduce((acc, item) => {
    if (!acc[item.reservation_date]) acc[item.reservation_date] = [];
    acc[item.reservation_date].push(item);
    return acc;
  }, {});
}

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [dayReservations, setDayReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelingId, setCancelingId] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    reserverName: '',
    contact: '',
    startHour: '9',
    endHour: '10',
    endDate: '',
    purpose: '',
    cancelCode: ''
  });

  async function loadUpcoming() {
    const res = await fetch('/api/reservations', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '读取预约失败');
    setReservations(json.reservations || []);
  }

  async function loadDay(date) {
    const res = await fetch(`/api/reservations?date=${date}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '读取当天预约失败');
    setDayReservations(json.reservations || []);
  }

  async function refresh(date = selectedDate) {
    setLoading(true);
    setMessage('');
    try {
      await Promise.all([loadUpcoming(), loadDay(date)]);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const today = todayString();
    setSelectedDate(today);
    setForm((prev) => ({ ...prev, endDate: today }));
    setIsReady(true);
    refresh(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isReady || !selectedDate) return;
    loadDay(selectedDate).catch((error) => setMessage(error.message));
  }, [selectedDate, isReady]);

  const groupedReservations = useMemo(() => groupByDate(reservations), [reservations]);

  const endHourOptions = useMemo(() => {
    const startHour = Number(form.startHour);
    return HOURS.slice(1).filter((hour) => form.endDate !== selectedDate || hour > startHour);
  }, [form.endDate, form.startHour, selectedDate]);

  useEffect(() => {
    if (endHourOptions.length === 0) return;
    if (!endHourOptions.includes(Number(form.endHour))) {
      setForm((prev) => ({ ...prev, endHour: String(endHourOptions[0]) }));
    }
  }, [endHourOptions, form.endHour]);

  const bookedMap = useMemo(() => {
    const map = new Map();
    for (const reservation of dayReservations) {
      const reservationStart = toSlot(reservation.reservation_date, reservation.start_hour);
      const reservationEnd = toSlot(reservation.end_date || reservation.reservation_date, reservation.end_hour);

      for (const hour of HOURS.slice(0, -1)) {
        const slotStart = toSlot(selectedDate, hour);
        const slotEnd = toSlot(selectedDate, hour + 1);
        if (reservationStart < slotEnd && reservationEnd > slotStart && !map.has(hour)) {
          map.set(hour, reservation);
        }
      }
    }
    return map;
  }, [dayReservations, selectedDate]);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleStartDateChange(value) {
    setSelectedDate(value);
    setForm((prev) => ({
      ...prev,
      endDate: prev.endDate < value ? value : prev.endDate
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      if (!selectedDate || !form.endDate) {
        throw new Error('请选择开始日期和结束日期。');
      }

      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          reservationDate: selectedDate,
          endDate: form.endDate,
          startHour: Number(form.startHour),
          endHour: Number(form.endHour)
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '预约失败');

      setMessage('预约成功！请记住你设置的取消密码，之后取消预约时需要使用。');
      setForm((prev) => ({ ...prev, endDate: selectedDate, purpose: '', cancelCode: '' }));
      await refresh(selectedDate);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(reservation) {
    const cancelCode = window.prompt(
      `请输入取消密码，确认取消 ${formatReservationRange(reservation)} 的预约。`
    );

    if (cancelCode === null) return;
    if (!cancelCode.trim()) {
      setMessage('请输入取消密码后再取消预约。');
      return;
    }

    const confirmed = window.confirm('确认取消这条预约吗？取消后该时间段会重新开放。');
    if (!confirmed) return;

    setCancelingId(reservation.id);
    setMessage('');

    try {
      if (!selectedDate || !form.endDate) {
        throw new Error('请选择开始日期和结束日期。');
      }

      const res = await fetch('/api/reservations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reservation.id,
          cancelCode,
          reservationDate: reservation.reservation_date,
          endDate: reservation.end_date || reservation.reservation_date,
          startHour: reservation.start_hour,
          endHour: reservation.end_hour,
          reserverName: reservation.reserver_name
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '取消预约失败');

      setMessage('预约已取消，时间段已重新开放。');
      await refresh(selectedDate);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCancelingId('');
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Single Cell Station Booking</p>
          <h1>单电池仪器预约平台</h1>
          <p className="hero-text">
            选择日期与小时段提交预约。短时间测试只需选择同一天；多日占用时可把结束日期改为后续日期，系统会自动阻止与已有预约重叠。
          </p>
        </div>
        <button className="refresh-button" onClick={() => refresh()} disabled={loading}>
          {loading ? '刷新中…' : '刷新预约'}
        </button>
      </section>

      {message && <div className={message.includes('成功') || message.includes('已取消') ? 'notice success' : 'notice'}>{message}</div>}

      <section className="grid-layout">
        <div className="card booking-card">
          <div className="card-header">
            <h2>新建预约</h2>
            <span>{selectedDate ? formatDateLabel(selectedDate) : '正在读取日期…'}</span>
          </div>

          <form onSubmit={handleSubmit} className="booking-form">
            <div className="two-columns">
              <label>
                开始日期
                <input
                  type="date"
                  value={selectedDate}
                  min={todayString()}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  required
                />
              </label>

              <label>
                结束日期
                <input
                  type="date"
                  value={form.endDate}
                  min={selectedDate || undefined}
                  onChange={(event) => updateForm('endDate', event.target.value)}
                  required
                />
              </label>
            </div>

            <div className="two-columns">
              <label>
                开始时间
                <select value={form.startHour} onChange={(event) => updateForm('startHour', event.target.value)}>
                  {HOURS.slice(0, -1).map((hour) => (
                    <option key={hour} value={hour}>{formatHour(hour)}</option>
                  ))}
                </select>
              </label>

              <label>
                结束时间
                <select value={form.endHour} onChange={(event) => updateForm('endHour', event.target.value)}>
                  {endHourOptions.map((hour) => (
                    <option key={hour} value={hour}>{formatHour(hour)}</option>
                  ))}
                </select>
              </label>
            </div>

            <p className="form-note">
              多日预约示例：开始日期选择 6 月 10 日 09:00，结束日期选择 6 月 13 日 09:00，即表示连续占用 3 天。
            </p>

            <label>
              预约人
              <input
                value={form.reserverName}
                onChange={(event) => updateForm('reserverName', event.target.value)}
                placeholder="例如：许博星"
                required
              />
            </label>

            <label>
              联系方式，可选
              <input
                value={form.contact}
                onChange={(event) => updateForm('contact', event.target.value)}
                placeholder="例如：微信 / 手机 / 邮箱"
              />
            </label>

            <label>
              取消密码
              <input
                type="password"
                value={form.cancelCode}
                onChange={(event) => updateForm('cancelCode', event.target.value)}
                placeholder="至少 4 位；之后取消预约时使用"
                minLength={4}
                required
              />
              <small className="field-hint">系统不会在首页显示取消密码，请预约人自行记住。</small>
            </label>

            <label>
              用途，可选
              <textarea
                value={form.purpose}
                onChange={(event) => updateForm('purpose', event.target.value)}
                placeholder="例如：稳定性测试；样品编号 OPBI-PDA-1"
                rows={3}
              />
            </label>

            <button className="submit-button" type="submit" disabled={submitting}>
              {submitting ? '提交中…' : isReady ? '提交预约' : '正在初始化…'}
            </button>
          </form>
        </div>

        <div className="card timeline-card">
          <div className="card-header">
            <h2>当天时间段</h2>
            <span>{dayReservations.length} 条预约</span>
          </div>

          <div className="timeline">
            {HOURS.slice(0, -1).map((hour) => {
              const reservation = bookedMap.get(hour);
              return (
                <div className={reservation ? 'slot booked' : 'slot free'} key={hour}>
                  <div className="slot-time">{formatHour(hour)} - {formatHour(hour + 1)}</div>
                  <div className="slot-content">
                    {reservation ? (
                      <>
                        <strong>{reservation.reserver_name}</strong>
                        <span>{reservation.purpose || '已预约'}</span>
                        {isMultiDay(reservation) && <small className="long-badge">多日预约：{formatReservationRange(reservation)}</small>}
                      </>
                    ) : (
                      <span>可预约</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card upcoming-card">
        <div className="card-header">
          <h2>首页预约总览</h2>
          <span>未来 60 天</span>
        </div>

        {loading ? (
          <p className="empty">正在读取预约信息…</p>
        ) : reservations.length === 0 ? (
          <p className="empty">目前还没有预约。</p>
        ) : (
          <div className="reservation-list">
            {Object.entries(groupedReservations).map(([date, items]) => (
              <div className="date-group" key={date}>
                <h3>{formatDateLabel(date)}</h3>
                <div className="reservation-items">
                  {items.map((item) => (
                    <article className={isMultiDay(item) ? 'reservation-item long-reservation' : 'reservation-item'} key={item.id}>
                      <div className="reservation-main">
                        <strong>{formatReservationRange(item)}</strong>
                        {isMultiDay(item) && <span className="long-label">多日预约</span>}
                        <p>{item.purpose || '未填写用途'}</p>
                      </div>
                      <div className="person">
                        <span>{item.reserver_name}</span>
                        {item.contact && <small>{item.contact}</small>}
                        <button
                          type="button"
                          className="cancel-button"
                          onClick={() => handleCancel(item)}
                          disabled={cancelingId === item.id}
                        >
                          {cancelingId === item.id ? '取消中…' : '取消预约'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="site-footer">
        <p>© 2026 兰州大学化学化工学院宫琛亮课题组. All Rights Reserved.</p>
        <p>本平台仅限兰州大学化学化工学院宫琛亮课题组内部用于单电池仪器预约与信息同步。</p>
        <p>页面内容、程序代码与预约数据未经授权不得复制、传播或用于商业用途。</p>
        <p>技术维护：许博星｜知识产权与管理单位：兰州大学化学化工学院宫琛亮课题组</p>
      </footer>
    </main>
  );
}

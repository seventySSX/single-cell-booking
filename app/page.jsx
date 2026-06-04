'use client';

import { useEffect, useMemo, useState } from 'react';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7:00 - 23:00，可按需修改

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

function groupByDate(reservations) {
  return reservations.reduce((acc, item) => {
    if (!acc[item.reservation_date]) acc[item.reservation_date] = [];
    acc[item.reservation_date].push(item);
    return acc;
  }, {});
}

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [reservations, setReservations] = useState([]);
  const [dayReservations, setDayReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    reserverName: '',
    contact: '',
    startHour: '9',
    endHour: '10',
    purpose: ''
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
    refresh(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDay(selectedDate).catch((error) => setMessage(error.message));
  }, [selectedDate]);

  const groupedReservations = useMemo(() => groupByDate(reservations), [reservations]);

  const bookedMap = useMemo(() => {
    const map = new Map();
    for (const reservation of dayReservations) {
      for (let hour = reservation.start_hour; hour < reservation.end_hour; hour++) {
        map.set(hour, reservation);
      }
    }
    return map;
  }, [dayReservations]);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          reservationDate: selectedDate,
          startHour: Number(form.startHour),
          endHour: Number(form.endHour)
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '预约失败');

      setMessage('预约成功！首页预约列表已更新。');
      setForm((prev) => ({ ...prev, purpose: '' }));
      await refresh(selectedDate);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Single Cell Station Booking</p>
          <h1>单电池仪器预约平台</h1>
          <p className="hero-text">
            选择日期与小时段提交预约。已有预约会显示在首页和当天时间轴中，系统会自动阻止重复占用同一时间段。
          </p>
        </div>
        <button className="refresh-button" onClick={() => refresh()} disabled={loading}>
          {loading ? '刷新中…' : '刷新预约'}
        </button>
      </section>

      {message && <div className={message.includes('成功') ? 'notice success' : 'notice'}>{message}</div>}

      <section className="grid-layout">
        <div className="card booking-card">
          <div className="card-header">
            <h2>新建预约</h2>
            <span>{formatDateLabel(selectedDate)}</span>
          </div>

          <form onSubmit={handleSubmit} className="booking-form">
            <label>
              选择日期
              <input
                type="date"
                value={selectedDate}
                min={todayString()}
                onChange={(event) => setSelectedDate(event.target.value)}
                required
              />
            </label>

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
                  {HOURS.slice(1).map((hour) => (
                    <option key={hour} value={hour}>{formatHour(hour)}</option>
                  ))}
                </select>
              </label>
            </div>

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
              用途，可选
              <textarea
                value={form.purpose}
                onChange={(event) => updateForm('purpose', event.target.value)}
                placeholder="例如：单电池极化曲线测试；样品编号 OPBI-PDA-1"
                rows={3}
              />
            </label>

            <button className="submit-button" type="submit" disabled={submitting}>
              {submitting ? '提交中…' : '提交预约'}
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
          <span>未来 30 天</span>
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
                    <article className="reservation-item" key={item.id}>
                      <div>
                        <strong>{formatHour(item.start_hour)} - {formatHour(item.end_hour)}</strong>
                        <p>{item.purpose || '未填写用途'}</p>
                      </div>
                      <div className="person">
                        <span>{item.reserver_name}</span>
                        {item.contact && <small>{item.contact}</small>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

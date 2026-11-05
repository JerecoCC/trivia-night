import { useMemo, useState } from 'react';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import ListItem, { type ListItemAction } from '@jerecocc/tracker-ui/components/ListItem/ListItem';
import Section from '@jerecocc/tracker-ui/components/Section/Section';
import Tag from '@jerecocc/tracker-ui/components/Tag/Tag';
import useBackgroundModalAction from '@/hooks/useBackgroundModalAction';
import useEvents, { type EventRecord } from '@/hooks/useEvents';
import {
  eventDayOfMonth,
  formatEventDate,
  formatEventStart,
  groupEventsByMonth,
  splitEventsByDate,
} from '@/lib/eventSchedule';
import EmptyMessage from '@/shared/EmptyMessage/EmptyMessage';
import ResponsiveList from '@/shared/ResponsiveList/ResponsiveList';
import EventDeleteModal from './EventDeleteModal';
import EventFormModal from './EventFormModal';
import styles from './Events.module.scss';

const EventsPage = () => {
  const { events, loading, busy, addEvent, updateEvent, deleteEvent } = useEvents();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EventRecord | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { upcoming, past } = useMemo(() => splitEventsByDate(events), [events]);

  const openModal = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEditModal = (event: EventRecord) => {
    setEditTarget(event);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditTarget(null);
  };

  const closeDeleteModal = () => {
    setConfirmDeleteOpen(false);
    setConfirmDelete(null);
  };

  // The delete dialog hides while the event is deleted behind a progress toast, and reappears if
  // the delete fails.
  const { hidden: deleteHidden, runSettled: runDelete } = useBackgroundModalAction({
    target: confirmDeleteOpen ? (confirmDelete?.id ?? null) : null,
    onDone: closeDeleteModal,
  });

  const renderEvent = (event: EventRecord) => (
    <ListItem
      key={event.id}
      fullWidth
      placeholder={eventDayOfMonth(event.scheduled_date)}
      primaryColor="#ea580c"
      textColor="#ffffff"
      eyebrow={event.is_owner ? undefined : `Hosted by ${event.owner_name}`}
      name={event.name}
      subtitle={`${formatEventDate(event.scheduled_date)} · ${formatEventStart(event.scheduled_start)}`}
      rightContent={
        // Like a hockey game's venue: a muted column that lines up across rows, then the tag.
        <div className={styles.rowEnd}>
          <span className={styles.location}>{event.is_online ? null : event.location}</span>
          <Tag
            label={event.is_online ? 'Online' : 'In Person'}
            intent={event.is_online ? 'info' : 'neutral'}
          />
        </div>
      }
      actions={
        event.is_owner
          ? ([
              {
                icon: 'edit',
                intent: 'accent',
                tooltip: 'Edit',
                disabled: busy === event.id,
                onClick: () => openEditModal(event),
              },
              {
                icon: 'delete',
                intent: 'danger',
                tooltip: 'Delete',
                disabled: busy === event.id,
                onClick: () => {
                  setConfirmDelete(event);
                  setConfirmDeleteOpen(true);
                },
              },
            ] satisfies ListItemAction[])
          : undefined
      }
    />
  );

  const renderMonths = (list: EventRecord[]) => (
    <div className={styles.months}>
      {groupEventsByMonth(list).map((group) => (
        <div
          key={group.key}
          className={styles.month}
        >
          <h3 className={styles.monthHeading}>{group.label}</h3>
          <ResponsiveList>{group.events.map(renderEvent)}</ResponsiveList>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className={styles.sections}>
        <Section
          title="Upcoming Events"
          action={
            <Button
              icon="add"
              size="medium"
              onClick={openModal}
            >
              Create Event
            </Button>
          }
        >
          {loading ? (
            <EmptyMessage>Loading...</EmptyMessage>
          ) : upcoming.length === 0 ? (
            <EmptyMessage>No upcoming events. Create one to get started.</EmptyMessage>
          ) : (
            renderMonths(upcoming)
          )}
        </Section>

        {past.length > 0 && <Section title="Past Events">{renderMonths(past)}</Section>}
      </div>

      <EventDeleteModal
        open={confirmDeleteOpen && !deleteHidden}
        busy={busy}
        target={confirmDelete}
        onCancel={closeDeleteModal}
        onConfirm={() => {
          if (!confirmDelete) return;
          const { id } = confirmDelete;
          void runDelete(() => deleteEvent(id), { pending: 'Deleting event…' });
        }}
      />

      <EventFormModal
        open={modalOpen}
        editTarget={editTarget}
        onClose={closeModal}
        addEvent={addEvent}
        updateEvent={updateEvent}
      />
    </>
  );
};

export default EventsPage;

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-toastify';

import { API, authHeaders, getApiErrorMessage as apiError } from '@/lib/apiClient';

export interface EventRecord {
  id: string;
  name: string;
  /** Local calendar date at the venue, YYYY-MM-DD. */
  scheduled_date: string;
  /** Local start time at the venue, HH:MM (24-hour). */
  scheduled_start: string;
  is_online: boolean;
  /** Venue for in-person events; null when the event is online. */
  location: string | null;
  owner_id: string;
  owner_name: string;
  /** True when the signed-in user planned this event and may edit or delete it. */
  is_owner: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventInput {
  name: string;
  scheduled_date: string;
  scheduled_start: string;
  is_online: boolean;
  /** Required unless the event is online. */
  location: string | null;
}

const EVENTS_QUERY_KEY = ['events'];

const useEvents = () => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: events = [], isLoading: loading } = useQuery({
    queryKey: EVENTS_QUERY_KEY,
    queryFn: async () => {
      try {
        const { data } = await axios.get<EventRecord[]>(`${API}/events`, {
          headers: authHeaders(),
        });
        return data;
      } catch (err) {
        toast.error(apiError(err, 'Failed to load events'));
        return [] as EventRecord[];
      }
    },
  });

  const addEvent = async (payload: EventInput): Promise<boolean> => {
    try {
      await axios.post(`${API}/events`, payload, { headers: authHeaders() });
      toast.success('Event created!');
      await queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
      return true;
    } catch (err) {
      toast.error(apiError(err, 'Failed to create event'));
      return false;
    }
  };

  const updateEvent = async (id: string, payload: Partial<EventInput>): Promise<boolean> => {
    setBusy(id);
    try {
      await axios.patch(`${API}/events/${id}`, payload, { headers: authHeaders() });
      toast.success('Event updated!');
      await queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
      return true;
    } catch (err) {
      toast.error(apiError(err, 'Failed to update event'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const deleteEvent = async (id: string): Promise<boolean> => {
    setBusy(id);
    try {
      await axios.delete(`${API}/events/${id}`, { headers: authHeaders() });
      toast.success('Event deleted');
      // The list refreshes in the background, so callers aren't held up by it.
      void queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
      return true;
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete event'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { events, loading, busy, addEvent, updateEvent, deleteEvent };
};

export default useEvents;

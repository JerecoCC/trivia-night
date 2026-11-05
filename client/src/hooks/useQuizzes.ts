import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-toastify';

import { API, authHeaders, getApiErrorMessage as apiError } from '@/lib/apiClient';
import { type QuizInput, type QuizSummary } from '@/lib/quizzes';

export const QUIZ_LIST_QUERY_KEY = ['quizzes', 'list'];
export const quizDetailQueryKey = (id: string) => ['quizzes', 'detail', id];

/** The signed-in planner's quizzes. */
const useQuizzes = () => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: quizzes = [], isLoading: loading } = useQuery({
    queryKey: QUIZ_LIST_QUERY_KEY,
    queryFn: async () => {
      try {
        const { data } = await axios.get<QuizSummary[]>(`${API}/quizzes`, {
          headers: authHeaders(),
        });
        return data;
      } catch (err) {
        toast.error(apiError(err, 'Failed to load quizzes'));
        return [] as QuizSummary[];
      }
    },
  });

  /** Resolves to the new quiz, or null if it couldn't be created. */
  const addQuiz = async (payload: QuizInput): Promise<QuizSummary | null> => {
    try {
      const { data } = await axios.post<QuizSummary>(`${API}/quizzes`, payload, {
        headers: authHeaders(),
      });
      toast.success('Quiz created!');
      void queryClient.invalidateQueries({ queryKey: QUIZ_LIST_QUERY_KEY });
      return data;
    } catch (err) {
      toast.error(apiError(err, 'Failed to create quiz'));
      return null;
    }
  };

  const updateQuiz = async (id: string, payload: Partial<QuizInput>): Promise<boolean> => {
    setBusy(id);
    try {
      const { data } = await axios.patch(`${API}/quizzes/${id}`, payload, {
        headers: authHeaders(),
      });
      queryClient.setQueryData(quizDetailQueryKey(id), data);
      toast.success('Quiz updated!');
      await queryClient.invalidateQueries({ queryKey: QUIZ_LIST_QUERY_KEY });
      // Events show the name of the quiz they play.
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      return true;
    } catch (err) {
      toast.error(apiError(err, 'Failed to update quiz'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const deleteQuiz = async (id: string): Promise<boolean> => {
    setBusy(id);
    try {
      await axios.delete(`${API}/quizzes/${id}`, { headers: authHeaders() });
      toast.success('Quiz deleted');
      queryClient.removeQueries({ queryKey: quizDetailQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: QUIZ_LIST_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      return true;
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete quiz'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { quizzes, loading, busy, addQuiz, updateQuiz, deleteQuiz };
};

export default useQuizzes;

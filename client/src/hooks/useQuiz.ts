import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios, { isAxiosError } from 'axios';
import { toast } from 'react-toastify';

import { API, authHeaders, getApiErrorMessage as apiError } from '@/lib/apiClient';
import {
  type CategoryInput,
  type QuestionInput,
  type QuizDetail,
  type QuizInput,
  type QuizOrder,
  type RoundInput,
} from '@/lib/quizzes';
import { QUIZ_LIST_QUERY_KEY, quizDetailQueryKey } from './useQuizzes';

/**
 * One of the planner's quizzes with its rounds, categories and questions. Every change responds with
 * the whole quiz, which replaces the cached copy, so the page shows the saved order at once.
 */
const useQuiz = (quizId: string) => {
  const queryClient = useQueryClient();
  const detailKey = quizDetailQueryKey(quizId);

  const {
    data: quiz = null,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: detailKey,
    queryFn: async () => {
      const { data } = await axios.get<QuizDetail>(`${API}/quizzes/${quizId}`, {
        headers: authHeaders(),
      });
      return data;
    },
    retry: (count, err) => !(isAxiosError(err) && err.response?.status === 404) && count < 2,
  });
  const notFound = isAxiosError(error) && error.response?.status === 404;

  // A missing quiz gets its own message on the page; anything else is a toast.
  useEffect(() => {
    if (error && !notFound) toast.error(apiError(error, 'Failed to load quiz'));
  }, [error, notFound]);

  const save = async (
    request: () => Promise<{ data: QuizDetail }>,
    messages: { success?: string; error: string },
  ): Promise<boolean> => {
    try {
      const { data } = await request();
      queryClient.setQueryData(detailKey, data);
      if (messages.success) toast.success(messages.success);
      // The quiz list shows question and category counts.
      void queryClient.invalidateQueries({ queryKey: QUIZ_LIST_QUERY_KEY, exact: true });
      return true;
    } catch (err) {
      toast.error(apiError(err, messages.error));
      return false;
    }
  };

  const base = `${API}/quizzes/${quizId}`;
  const options = () => ({ headers: authHeaders() });

  const updateQuiz = (payload: Partial<QuizInput>) =>
    save(() => axios.patch(base, payload, options()), {
      success: 'Quiz updated!',
      error: 'Failed to update quiz',
    }).then((ok) => {
      if (ok) void queryClient.invalidateQueries({ queryKey: ['events'] });
      return ok;
    });

  const addRound = (payload: RoundInput) =>
    save(() => axios.post(`${base}/rounds`, payload, options()), {
      success: 'Round added!',
      error: 'Failed to add round',
    });

  const updateRound = (roundId: string, payload: RoundInput) =>
    save(() => axios.patch(`${base}/rounds/${roundId}`, payload, options()), {
      success: 'Round updated!',
      error: 'Failed to update round',
    });

  const deleteRound = (roundId: string) =>
    save(() => axios.delete(`${base}/rounds/${roundId}`, options()), {
      success: 'Round deleted',
      error: 'Failed to delete round',
    });

  const addCategory = (payload: CategoryInput) =>
    save(() => axios.post(`${base}/categories`, payload, options()), {
      success: 'Category added!',
      error: 'Failed to add category',
    });

  const updateCategory = (categoryId: string, payload: CategoryInput) =>
    save(() => axios.patch(`${base}/categories/${categoryId}`, payload, options()), {
      success: 'Category updated!',
      error: 'Failed to update category',
    });

  const deleteCategory = (categoryId: string) =>
    save(() => axios.delete(`${base}/categories/${categoryId}`, options()), {
      success: 'Category deleted',
      error: 'Failed to delete category',
    });

  const addQuestion = (payload: QuestionInput) =>
    save(() => axios.post(`${base}/questions`, payload, options()), {
      success: 'Question added!',
      error: 'Failed to add question',
    });

  const updateQuestion = (questionId: string, payload: QuestionInput) =>
    save(() => axios.patch(`${base}/questions/${questionId}`, payload, options()), {
      success: 'Question updated!',
      error: 'Failed to update question',
    });

  const deleteQuestion = (questionId: string) =>
    save(() => axios.delete(`${base}/questions/${questionId}`, options()), {
      success: 'Question deleted',
      error: 'Failed to delete question',
    });

  /** Saves a new order quietly; only a failure shows a toast. */
  const saveOrder = (order: QuizOrder) =>
    save(() => axios.put(`${base}/order`, order, options()), {
      error: 'Failed to save the new order',
    });

  return {
    quiz,
    loading,
    notFound,
    updateQuiz,
    addRound,
    updateRound,
    deleteRound,
    addCategory,
    updateCategory,
    deleteCategory,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    saveOrder,
  };
};

export default useQuiz;

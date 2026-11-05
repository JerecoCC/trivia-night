import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { upload } from '@vercel/blob/client';
import { API, authHeaders } from '@/lib/apiClient';

/** Files over this size upload in parallel parts, which copes better with long videos. */
const MULTIPART_THRESHOLD = 20 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Whether file uploads are set up on the server. Links work either way. */
export const useUploadsEnabled = () => {
  const { data = false } = useQuery({
    queryKey: ['uploads', 'status'],
    queryFn: async () => {
      const { data } = await axios.get<{ enabled: boolean }>(`${API}/uploads/status`, {
        headers: authHeaders(),
      });
      return data.enabled;
    },
    staleTime: Infinity,
  });
  return data;
};

/**
 * Uploads a photo, video or sound clip straight from the browser to file storage, after the
 * server hands out a token. Resolves to the file's public link.
 */
export const uploadQuestionMedia = async (
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<string> => {
  const safeName = file.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  const blob = await upload(`quiz-media/${safeName}`, file, {
    access: 'public',
    handleUploadUrl: `${API}/uploads/quiz-media`,
    headers: authHeaders(),
    contentType: file.type || undefined,
    multipart: file.size > MULTIPART_THRESHOLD,
    onUploadProgress: ({ percentage }) => onProgress?.(percentage),
  });
  return blob.url;
};

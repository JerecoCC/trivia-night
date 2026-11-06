import { useRef, useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faImage, faMusic, faPlay } from '@fortawesome/free-solid-svg-icons';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import FormField from '@jerecocc/tracker-ui/components/FormField/FormField';
import Input from '@jerecocc/tracker-ui/components/Input/Input';
import { MAX_UPLOAD_BYTES, uploadQuestionMedia, useUploadsEnabled } from '@/hooks/useUploads';
import { getApiErrorMessage } from '@/lib/apiClient';
import {
  MAX_MEDIA,
  MEDIA_KIND_LABELS,
  mediaKindFromFile,
  mediaKindFromLink,
  youtubeVideoId,
  type MediaKind,
  type QuestionMedia,
} from '@/lib/quizzes';
import styles from './QuizDetails.module.scss';

const KIND_ICONS = { image: faImage, video: faFilm, audio: faMusic, youtube: faPlay };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What the planner sees for an item: its file name, or the kind and where it's from. */
const mediaLabel = (item: QuestionMedia) => {
  if (item.name) return item.name;
  const kind = capitalize(MEDIA_KIND_LABELS[item.kind].singular);
  if (item.kind === 'youtube') return kind;
  try {
    return `${kind} from ${new URL(item.url).hostname.replace(/^www\./, '')}`;
  } catch {
    return kind;
  }
};

/** A small preview: the photo, a playable video or clip, or the YouTube thumbnail. */
const MediaPreview = ({ item }: { item: QuestionMedia }) => {
  if (item.kind === 'image') {
    return (
      <img
        className={styles.mediaThumb}
        src={item.url}
        alt=""
      />
    );
  }
  if (item.kind === 'video') {
    return (
      <video
        className={styles.mediaThumb}
        src={item.url}
        controls
        preload="metadata"
      />
    );
  }
  if (item.kind === 'audio') {
    return (
      <audio
        className={styles.mediaAudio}
        src={item.url}
        controls
        preload="metadata"
      />
    );
  }
  const id = youtubeVideoId(item.url);
  return (
    <a
      className={styles.mediaThumbLink}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch ${mediaLabel(item)} on YouTube`}
    >
      <img
        className={styles.mediaThumb}
        src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`}
        alt=""
      />
    </a>
  );
};

type Upload = { name: string; percentage: number };

interface Props {
  value: QuestionMedia[];
  onChange: (media: QuestionMedia[]) => void;
  /** Lets the form wait for an upload before saving. */
  onUploadingChange: (uploading: boolean) => void;
  disabled?: boolean;
}

/**
 * The photos, videos, sound clips and YouTube videos shown with a question: uploaded files
 * (when uploads are set up) or pasted links.
 */
const QuestionMediaField = (props: Props) => {
  const { value, onChange, onUploadingChange, disabled = false } = props;
  const uploadsEnabled = useUploadsEnabled();
  const fileInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Upload | null>(null);

  const full = value.length >= MAX_MEDIA;
  const busy = disabled || uploading !== null;

  const add = (item: QuestionMedia) => {
    setError(null);
    onChange([...value, item]);
  };

  const addLink = (event?: FormEvent) => {
    event?.preventDefault();
    const url = link.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) {
      setError('Links must start with https://');
      return;
    }
    const kind = mediaKindFromLink(url);
    if (!kind) {
      setError(
        'Use a YouTube link, or a link to a photo, video or sound clip ending in its file type, such as .jpg, .mp4 or .mp3.',
      );
      return;
    }
    add({ kind, url, name: null });
    setLink('');
  };

  const uploadFile = async (file: File) => {
    const kind: MediaKind | null = mediaKindFromFile(file);
    if (!kind) {
      setError('Upload a photo, video or sound clip.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Files can be up to 100 MB.');
      return;
    }
    setError(null);
    setUploading({ name: file.name, percentage: 0 });
    onUploadingChange(true);
    try {
      const url = await uploadQuestionMedia(file, (percentage) =>
        setUploading({ name: file.name, percentage }),
      );
      add({ kind, url, name: file.name });
    } catch (err) {
      setError(getApiErrorMessage(err, `Couldn’t upload ${file.name}. Please try again.`));
    } finally {
      setUploading(null);
      onUploadingChange(false);
    }
  };

  return (
    <FormField
      label="Media"
      invalid={error !== null}
      errorMessage={error ?? undefined}
    >
      {({ labelId }) => (
        <div
          className={styles.media}
          role="group"
          aria-labelledby={labelId}
        >
          {value.length > 0 && (
            <ul className={styles.mediaList}>
              {value.map((item, index) => (
                <li
                  key={`${item.url}-${index}`}
                  className={styles.mediaItem}
                >
                  <MediaPreview item={item} />
                  <span className={styles.mediaName}>
                    <FontAwesomeIcon
                      icon={KIND_ICONS[item.kind]}
                      className={styles.mediaKindIcon}
                    />
                    <span>{mediaLabel(item)}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    intent="danger"
                    icon="delete"
                    size="small"
                    tooltip="Remove"
                    aria-label={`Remove ${mediaLabel(item)}`}
                    disabled={busy}
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                  />
                </li>
              ))}
            </ul>
          )}

          {uploading && (
            <p
              className={styles.fieldHint}
              role="status"
            >
              Uploading {uploading.name}… {Math.round(uploading.percentage)}%
            </p>
          )}

          {!full && (
            <div className={styles.mediaAdd}>
              <Input
                type="url"
                value={link}
                onChange={(next) => {
                  setLink(next);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  // Enter adds the link instead of submitting the question.
                  if (event.key === 'Enter') addLink(event);
                }}
                placeholder="Paste a YouTube, photo, video or sound clip link"
                aria-label="Media link"
                disabled={busy}
                className={styles.mediaLinkInput}
              />
              <Button
                type="button"
                variant="outlined"
                intent="neutral"
                icon="add"
                size="small"
                disabled={busy || !link.trim()}
                onClick={() => addLink()}
              >
                Add Link
              </Button>
              {/* Until uploads are set up, media is added by link, and the tooltip says why. */}
              <Button
                type="button"
                variant="outlined"
                intent="accent"
                icon="image"
                size="small"
                disabled={busy || !uploadsEnabled}
                tooltip={uploadsEnabled ? undefined : 'File uploads aren’t set up yet'}
                onClick={() => fileInput.current?.click()}
              >
                Upload File
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/*,audio/*"
                className={styles.visuallyHidden}
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadFile(file);
                }}
              />
            </div>
          )}
        </div>
      )}
    </FormField>
  );
};

export default QuestionMediaField;

import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'SoundPMStudioDB';
const STORE_NAME = 'recordings';

export interface RecordingData {
  id: number;
  blob: Blob;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
};

export const saveAudioBlob = async (id: number, blob: Blob) => {
  const db = await getDB();
  await db.put(STORE_NAME, { id, blob });
};

export const getAudioBlob = async (id: number): Promise<Blob | null> => {
  const db = await getDB();
  const data = await db.get(STORE_NAME, id);
  return data ? data.blob : null;
};

export const deleteAudioBlob = async (id: number) => {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
};

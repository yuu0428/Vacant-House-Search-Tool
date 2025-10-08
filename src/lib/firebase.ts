import type { FirebaseEnv, Place, RouteBucket } from '../types'

let servicesPromise: Promise<FirebaseServices | null> | null = null

interface FirebaseServices {
  syncPlace(place: Place): Promise<void>
  removePlace(id: string): Promise<void>
  syncRoutes(buckets: RouteBucket[]): Promise<void>
}

function readFirebaseEnv(): FirebaseEnv | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  const appId = import.meta.env.VITE_FIREBASE_APP_ID
  const all = [
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  ]
  if (all.every(Boolean)) {
    return {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
    } as FirebaseEnv
  }
  return null
}

export function hasFirebaseConfig(): boolean {
  return readFirebaseEnv() !== null
}

export async function getFirebaseServices(): Promise<FirebaseServices | null> {
  if (servicesPromise) {
    return servicesPromise
  }
  const env = readFirebaseEnv()
  if (!env) {
    servicesPromise = Promise.resolve(null)
    return servicesPromise
  }
  servicesPromise = bootstrapFirebase(env)
  return servicesPromise
}

async function bootstrapFirebase(env: FirebaseEnv): Promise<FirebaseServices> {
  const [{ initializeApp }, { getFirestore, doc, setDoc, deleteDoc }, { getStorage, ref, uploadBytes }] =
    await Promise.all([
      import('firebase/app'),
      import('firebase/firestore'),
      import('firebase/storage'),
    ])
  const app = initializeApp(env)
  const firestore = getFirestore(app)
  const storage = getStorage(app)

  return {
    async syncPlace(place) {
      const docRef = doc(firestore, 'walktrace', 'default', 'places', place.id)
      const primaryPhoto = place.photos[0]
      await setDoc(docRef, {
        lat: place.lat,
        lng: place.lng,
        address: place.address,
        createdAtISO: place.createdAtISO,
        note: place.note ?? '',
        thumbDataURL: primaryPhoto?.thumbDataURL ?? null,
        photos: place.photos.map((photo) => ({
          id: photo.id,
          createdAtISO: photo.createdAtISO,
          hasBlob: Boolean(photo.blob),
          thumbDataURL: photo.thumbDataURL ?? null,
        })),
        updatedAtISO: new Date().toISOString(),
      })
      if (primaryPhoto?.blob) {
        const fileRef = ref(storage, `places/${place.id}/${primaryPhoto.id}.jpg`)
        await uploadBytes(fileRef, primaryPhoto.blob)
      }
    },
    async removePlace(id) {
      const docRef = doc(firestore, 'walktrace', 'default', 'places', id)
      await deleteDoc(docRef)
      // 写真ストレージは静的に削除対象を特定しづらいため、必要に応じて管理コンソールから削除してください
    },
    async syncRoutes(buckets) {
      await Promise.all(
        buckets.map((bucket) => {
          const docRef = doc(firestore, 'walktrace', 'default', 'routes', bucket.id)
          return setDoc(docRef, bucket)
        }),
      )
    },
  }
}

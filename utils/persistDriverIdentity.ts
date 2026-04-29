import AsyncStorage from '@react-native-async-storage/async-storage';

/** Shape from `GET /drivers/me` — keeps header + side flows in sync with AsyncStorage. */
export type DriverMePayload = {
  id: string;
  userId: string;
  status?: string;
  user: {
    id: string;
    phone?: string | null;
    firstName?: string | null;
    secondName?: string | null;
    image?: string | null;
    myEmail?: string | null;
  };
};

export async function persistDriverIdentityFromMe(profileData: DriverMePayload): Promise<void> {
  const u = profileData.user;
  if (!u?.id) return;
  await AsyncStorage.setItem(
    'user',
    JSON.stringify({
      id: u.id,
      phone: u.phone,
      firstName: u.firstName,
      secondName: u.secondName,
      image: u.image,
      myEmail: u.myEmail,
      role: 'DRIVER',
    }),
  );
  await AsyncStorage.setItem(
    'driver',
    JSON.stringify({
      id: profileData.id,
      userId: profileData.userId,
      status: profileData.status ?? 'INCOMPLETE',
    }),
  );
}

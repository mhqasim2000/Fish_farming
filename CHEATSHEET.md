# FishFarmApp Offline Coding Cheat Sheet

Use this sheet when you have to code without internet. It follows this project's existing React Native style.

## 1. Common Imports

```js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Fish, Plus, Trash2 } from 'lucide-react-native';
import {
  AppScaffold,
  Card,
  EmptyState,
  PrimaryButton,
  StatCard,
  Tag,
} from '../compoents/AppScaffold';
import { farmApi } from '../integration/farmApi';
```

## 2. Basic Screen Template

Use this for a normal app screen with top bar/sidebar.

```js
export default function MyScreen({ navigation, route }) {
  const [loading, setLoading] = useState(false);

  return (
    <AppScaffold
      title="My Screen"
      subtitle="Short description"
      navigation={navigation}
      currentRoute="MyRouteName"
    >
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <Card>
          <Text style={styles.title}>Hello</Text>
        </Card>
      )}
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  title: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
});
```

## 3. Add New Screen To Navigation

File: `assests/compoents/NavigationFF.js`

```js
import MyScreen from '../forms/MyScreen';

<Stack.Screen
  name="MyRouteName"
  component={MyScreen}
  options={{ headerShown: false }}
/>
```

To open it:

```js
navigation.navigate('MyRouteName');
```

With data:

```js
navigation.navigate('MyRouteName', {
  pondId: pond.id,
  pondName: pond.pondName,
});
```

Read data in next screen:

```js
const pondId = route?.params?.pondId;
```

## 4. Button

Best option: use project reusable button.

```js
<PrimaryButton
  title="Save"
  onPress={handleSave}
  disabled={loading}
/>
```

Custom button:

```js
<TouchableOpacity style={styles.button} onPress={handleSave}>
  <Text style={styles.buttonText}>Save</Text>
</TouchableOpacity>
```

```js
button: {
  backgroundColor: '#2563EB',
  borderRadius: 8,
  paddingVertical: 13,
  paddingHorizontal: 16,
  alignItems: 'center',
},
buttonText: {
  color: '#FFFFFF',
  fontWeight: '900',
},
```

Button with loading:

```js
<TouchableOpacity
  style={[styles.button, loading && styles.disabledButton]}
  onPress={handleSave}
  disabled={loading}
>
  {loading ? (
    <ActivityIndicator color="#FFFFFF" />
  ) : (
    <Text style={styles.buttonText}>Save</Text>
  )}
</TouchableOpacity>
```

## 5. Text Input

```js
const [pondName, setPondName] = useState('');

<Text style={styles.label}>Pond Name</Text>
<TextInput
  value={pondName}
  onChangeText={setPondName}
  style={styles.input}
  placeholder="e.g. Main Pond"
  placeholderTextColor="#9CA3AF"
/>
```

Numeric input:

```js
<TextInput
  value={quantity}
  onChangeText={setQuantity}
  keyboardType="numeric"
  style={styles.input}
/>
```

Multiline input:

```js
<TextInput
  value={notes}
  onChangeText={setNotes}
  multiline
  style={[styles.input, styles.textArea]}
/>
```

```js
label: {
  color: '#374151',
  fontWeight: '900',
  marginBottom: 7,
},
input: {
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 8,
  paddingHorizontal: 12,
  minHeight: 46,
  color: '#111827',
  backgroundColor: '#FFFFFF',
  marginBottom: 12,
},
textArea: {
  minHeight: 86,
  textAlignVertical: 'top',
  paddingTop: 12,
},
```

## 6. Dropdown List / Picker

```js
const [stage, setStage] = useState('Grown-out');
const stageOptions = ['Grown-out', 'Nursery', 'Juvenile'];

<Text style={styles.label}>Pond Stage</Text>
<View style={styles.pickerWrap}>
  <Picker
    selectedValue={stage}
    onValueChange={setStage}
    style={styles.picker}
    dropdownIconColor="#6B7280"
  >
    {stageOptions.map(option => (
      <Picker.Item key={option} label={option} value={option} />
    ))}
  </Picker>
</View>
```

```js
pickerWrap: {
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 8,
  overflow: 'hidden',
  marginBottom: 12,
  backgroundColor: '#FFFFFF',
},
picker: {
  color: '#111827',
  backgroundColor: '#FFFFFF',
},
```

Dropdown from API data:

```js
<Picker selectedValue={pondId} onValueChange={setPondId}>
  <Picker.Item label="Select pond" value="" />
  {ponds.map(pond => (
    <Picker.Item
      key={String(pond.PondId || pond.id)}
      label={pond.PondName || pond.pondName || 'Pond'}
      value={String(pond.PondId || pond.id)}
    />
  ))}
</Picker>
```

## 7. Card

```js
<Card>
  <Text style={styles.cardTitle}>Rohu</Text>
  <Text style={styles.notes}>Fast growing fish.</Text>
</Card>
```

```js
cardTitle: {
  color: '#111827',
  fontSize: 18,
  fontWeight: '900',
},
notes: {
  color: '#4B5563',
  fontSize: 13,
  lineHeight: 20,
  marginTop: 8,
},
```

## 8. Stats Cards

```js
<View style={styles.statsGrid}>
  <StatCard label="Total Fish" value="1,200 fish" />
  <StatCard label="Revenue" value="PKR 50,000" accent="#059669" />
  <StatCard label="Loss" value="PKR 2,000" accent="#DC2626" />
</View>
```

```js
statsGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 12,
},
```

## 9. Tag / Badge

```js
<Tag>Fish</Tag>

<Tag color="#ECFDF5" textColor="#059669">
  Active
</Tag>
```

Custom badge:

```js
<View style={styles.badge}>
  <Text style={styles.badgeText}>Suggested</Text>
</View>
```

```js
badge: {
  backgroundColor: '#DCFCE7',
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 4,
  alignSelf: 'flex-start',
},
badgeText: {
  color: '#166534',
  fontSize: 11,
  fontWeight: '900',
},
```

## 10. List Rendering

```js
{fishList.map(item => (
  <Card key={item.SpeciesId || item.id}>
    <Text style={styles.cardTitle}>{item.Name}</Text>
    <Text>{Number(item.Quantity || 0).toLocaleString()} fish</Text>
  </Card>
))}
```

Empty list:

```js
{fishList.length === 0 ? (
  <EmptyState title="No fish found" text="Add fish to show data here." />
) : (
  fishList.map(item => <Card key={item.id}><Text>{item.name}</Text></Card>)
)}
```

## 11. Tabs

```js
const tabs = [
  { id: 'fish', label: 'Fish' },
  { id: 'feed', label: 'Feed' },
];
const [activeTab, setActiveTab] = useState('fish');

<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
  {tabs.map(tab => (
    <TouchableOpacity
      key={tab.id}
      style={[styles.tab, activeTab === tab.id && styles.activeTab]}
      onPress={() => setActiveTab(tab.id)}
    >
      <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
        {tab.label}
      </Text>
    </TouchableOpacity>
  ))}
</ScrollView>

{activeTab === 'fish' && <Text>Fish content</Text>}
{activeTab === 'feed' && <Text>Feed content</Text>}
```

```js
tabs: {
  gap: 8,
  paddingBottom: 12,
},
tab: {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 8,
  paddingHorizontal: 14,
  paddingVertical: 10,
},
activeTab: {
  backgroundColor: '#2563EB',
  borderColor: '#2563EB',
},
tabText: {
  color: '#6B7280',
  fontWeight: '900',
  fontSize: 12,
},
activeTabText: {
  color: '#FFFFFF',
},
```

## 12. Modal / Popup Form

```js
const [showModal, setShowModal] = useState(false);

<PrimaryButton title="Open Modal" onPress={() => setShowModal(true)} />

<Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <Text style={styles.modalTitle}>Add Item</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <PrimaryButton title="Save" onPress={handleSave} />
      <TouchableOpacity style={styles.closeButton} onPress={() => setShowModal(false)}>
        <Text style={styles.closeText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

```js
modalBackdrop: {
  flex: 1,
  backgroundColor: 'rgba(15, 23, 42, 0.45)',
  justifyContent: 'flex-end',
},
modalCard: {
  backgroundColor: '#FFFFFF',
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  padding: 18,
  maxHeight: '92%',
},
modalTitle: {
  color: '#111827',
  fontSize: 22,
  fontWeight: '900',
  marginBottom: 16,
},
closeButton: {
  padding: 15,
  alignItems: 'center',
},
closeText: {
  color: '#6B7280',
  fontWeight: '900',
},
```

## 13. Alert Message

```js
Alert.alert('Error', 'Please fill all fields.');
```

Confirm before delete:

```js
Alert.alert('Delete', 'Are you sure?', [
  { text: 'Cancel', style: 'cancel' },
  {
    text: 'Delete',
    style: 'destructive',
    onPress: async () => {
      await farmApi.deletePond(id);
      fetchData();
    },
  },
]);
```

## 14. API Get Data

```js
const [ponds, setPonds] = useState([]);
const [loading, setLoading] = useState(true);

const fetchData = async () => {
  setLoading(true);
  try {
    const data = await farmApi.getPonds();
    setPonds(data || []);
  } catch (error) {
    Alert.alert('Ponds', error.message || 'Could not load ponds.');
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchData();
}, []);
```

## 15. API Post / Save Data

```js
const [saving, setSaving] = useState(false);

const handleSave = async () => {
  if (!name.trim()) {
    Alert.alert('Error', 'Name is required.');
    return;
  }

  setSaving(true);
  try {
    await farmApi.addPond({
      PondName: name.trim(),
      Size: Number(size),
    });
    Alert.alert('Success', 'Saved successfully.');
    navigation.goBack();
  } catch (error) {
    Alert.alert('Save failed', error.message || 'Could not save.');
  } finally {
    setSaving(false);
  }
};
```

## 16. Add New API Function

File: `assests/integration/farmApi.js`

```js
getMyData: () => fetchWithAuth('/my-endpoint'),

createMyData: data =>
  fetchWithAuth('/my-endpoint', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

updateMyData: (id, data) =>
  fetchWithAuth(`/my-endpoint/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

deleteMyData: id =>
  fetchWithAuth(`/my-endpoint/${id}`, {
    method: 'DELETE',
  }),
```

Use in screen:

```js
const data = await farmApi.getMyData();
await farmApi.createMyData({ name, quantity: Number(quantity) });
```

## 17. Form Validation

```js
if (!pondName.trim()) {
  Alert.alert('Pond', 'Pond name is required.');
  return;
}

if (!size || Number(size) <= 0) {
  Alert.alert('Pond', 'Enter a valid pond size.');
  return;
}

if (!selectedPondId) {
  Alert.alert('Pond', 'Please select a pond.');
  return;
}
```

## 18. Derived Calculations

```js
const totalFish = inventory.reduce(
  (sum, item) => sum + Number(item.Quantity || 0),
  0,
);
```

With `useMemo`:

```js
const totalValue = useMemo(() => {
  return inventory.reduce(
    (sum, item) =>
      sum + Number(item.Quantity || 0) * Number(item.PricePerPiece || 0),
    0,
  );
}, [inventory]);
```

## 19. Conditional Rendering

```js
{loading ? (
  <ActivityIndicator size="large" color="#2563EB" />
) : error ? (
  <Text style={styles.errorText}>{error}</Text>
) : (
  <Text>Data loaded</Text>
)}
```

Show only if value exists:

```js
{!!item.Description && <Text style={styles.notes}>{item.Description}</Text>}
```

## 20. Icons

```js
import { Fish, Trash2, Pencil } from 'lucide-react-native';

<Fish size={18} color="#2563EB" />
<Trash2 size={16} color="#DC2626" />
<Pencil size={16} color="#2563EB" />
```

Icon button:

```js
<TouchableOpacity style={styles.iconButton} onPress={handleEdit}>
  <Pencil size={18} color="#2563EB" />
</TouchableOpacity>
```

```js
iconButton: {
  width: 38,
  height: 38,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#EFF6FF',
},
```

## 21. Search / Filter

```js
const [search, setSearch] = useState('');

const filtered = list.filter(item =>
  String(item.Name || '')
    .toLowerCase()
    .includes(search.toLowerCase()),
);

<TextInput
  value={search}
  onChangeText={setSearch}
  style={styles.input}
  placeholder="Search..."
/>

{filtered.map(item => (
  <Card key={item.id}>
    <Text>{item.Name}</Text>
  </Card>
))}
```

## 22. Toggle Select Card

```js
const [selectedIds, setSelectedIds] = useState([]);

const toggleItem = id => {
  if (selectedIds.includes(id)) {
    setSelectedIds(selectedIds.filter(item => item !== id));
  } else {
    setSelectedIds([...selectedIds, id]);
  }
};

{species.map(item => {
  const selected = selectedIds.includes(item.SpeciesId);
  return (
    <TouchableOpacity
      key={item.SpeciesId}
      style={[styles.optionCard, selected && styles.optionCardSelected]}
      onPress={() => toggleItem(item.SpeciesId)}
    >
      <Text style={styles.optionTitle}>{item.Name}</Text>
    </TouchableOpacity>
  );
})}
```

```js
optionCard: {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 8,
  padding: 14,
  marginBottom: 10,
},
optionCardSelected: {
  borderColor: '#2563EB',
  backgroundColor: '#EFF6FF',
},
optionTitle: {
  color: '#111827',
  fontWeight: '900',
},
```

## 23. Date Formatting

```js
function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString();
}

<Text>{formatDate(item.CreatedAt)}</Text>
```

Today's date for API:

```js
const today = new Date().toISOString().slice(0, 10);
```

## 24. Number Formatting

```js
Number(quantity || 0).toLocaleString()
Number(area || 0).toFixed(2)
```

Examples:

```js
<Text>{Number(totalFish || 0).toLocaleString()} fish</Text>
<Text>{Number(sizeAcres || 0).toFixed(2)} acres</Text>
<Text>PKR {Number(amount || 0).toLocaleString()}</Text>
```

## 25. Login / Session Pattern

Login uses:

```js
const data = await farmApi.login(email.trim(), password);
setSession({ token: data.token, user: data.user });
```

Logout uses:

```js
clearSession();
navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
```

Current user:

```js
import { getSession } from '../integration/farmApi';

const user = getSession().user;
const role = user?.role || 'user';
```

## 26. Common Project Routes

```txt
Login
SignUp
Dashboard
AddPond
FarmPlanner
StockManagement
FishSpecies
FeedGuide
WaterQuality
Fertilization
Info
Marketplace
Admin
BudgetE
Reports
WelcomeSetup
FarmArea
SpeciesSelection
Stocking
LogMortality
HarvestFish
```

## 27. Common Colors

```txt
Blue primary: #2563EB
Green success: #059669
Red danger: #DC2626
Orange warning: #B45309
Purple: #7C3AED
Text dark: #111827
Text muted: #6B7280
Border: #E5E7EB
Page background: #F8FAFC
Card background: #FFFFFF
Light blue: #EFF6FF
Light green: #ECFDF5
Light red: #FEF2F2
```

## 28. Full Example: Simple CRUD List Screen

```js
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppScaffold, Card, EmptyState, PrimaryButton } from '../compoents/AppScaffold';
import { farmApi } from '../integration/farmApi';

export default function MyItemsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await farmApi.getMyData();
      setItems(data || []);
    } catch (error) {
      Alert.alert('Items', error.message || 'Could not load items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleAdd = async form => {
    await farmApi.createMyData(form);
    setShowAdd(false);
    fetchItems();
  };

  const handleDelete = item => {
    Alert.alert('Delete', `Delete ${item.Name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await farmApi.deleteMyData(item.Id);
          fetchItems();
        },
      },
    ]);
  };

  return (
    <AppScaffold
      title="My Items"
      subtitle="Manage records"
      navigation={navigation}
      currentRoute="MyItems"
    >
      <PrimaryButton title="+ Add Item" onPress={() => setShowAdd(true)} />

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : items.length === 0 ? (
        <EmptyState title="No items" text="Add your first record." />
      ) : (
        items.map(item => (
          <Card key={item.Id}>
            <Text style={styles.cardTitle}>{item.Name}</Text>
            <Text style={styles.notes}>{item.Description}</Text>
            <TouchableOpacity onPress={() => handleDelete(item)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </Card>
        ))
      )}

      <AddItemModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleAdd}
      />
    </AppScaffold>
  );
}

function AddItemModal({ visible, onClose, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Item', 'Name is required.');
      return;
    }

    setSaving(true);
    try {
      await onSave({ name: name.trim(), description });
      setName('');
      setDescription('');
    } catch (error) {
      Alert.alert('Item', error.message || 'Could not save item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add Item</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            style={[styles.input, styles.textArea]}
          />
          <PrimaryButton title={saving ? 'Saving...' : 'Save'} onPress={submit} disabled={saving} />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
  notes: {
    color: '#6B7280',
    marginTop: 6,
  },
  deleteText: {
    color: '#DC2626',
    fontWeight: '900',
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 18,
  },
  modalTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 16,
  },
  label: {
    color: '#374151',
    fontWeight: '900',
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    color: '#111827',
    marginBottom: 12,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  closeButton: {
    padding: 15,
    alignItems: 'center',
  },
  closeText: {
    color: '#6B7280',
    fontWeight: '900',
  },
});
```

## 29. Quick Debug Checklist

```txt
Blank screen:
- Check import path spelling.
- Check screen is added in NavigationFF.js.
- Check currentRoute/name spelling.
- Check return has one parent element.

Button not working:
- Check onPress={functionName}, not onPress={functionName()}.
- Check disabled is not true.

Dropdown not changing:
- Check selectedValue uses same type as item value.
- Convert IDs with String(id) if needed.

API not working:
- Check backend is running.
- Check assests/config/api.js BASE_URL.
- Check endpoint exists in farmApi.js.
- Check token/session if route needs auth.

List not showing:
- Check data is array.
- Check setState is called.
- Check map key is unique.

Input number problem:
- TextInput value must be string.
- Convert only when saving: Number(value).
```

## 30. Mini Patterns To Memorize

State:

```js
const [value, setValue] = useState('');
```

Load once:

```js
useEffect(() => {
  fetchData();
}, []);
```

Save with validation:

```js
if (!value) {
  Alert.alert('Error', 'Value is required.');
  return;
}
```

Map list:

```js
items.map(item => <Text key={item.id}>{item.name}</Text>)
```

Back:

```js
navigation.goBack();
```

Reset to dashboard:

```js
navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
```


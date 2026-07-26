import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Fish } from "lucide-react-native";
import { farmApi } from "../integration/farmApi";

const SignUp = ({ navigation }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [farmName, setFarmName] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in name, email, and password.");
      return;
    }
    if (!province) {
      setError("Please select your province.");
      return;
    }
    if (role === "user" && !farmName.trim()) {
      setError("Please enter your farm name.");
      return;
    }
    if (!city.trim()) {
      setError("Please enter your city or district.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        fullName: name.trim(),
        email: email.trim(),
        password,
        farmName: role === "Consumer" ? "" : farmName.trim(),
        district: city.trim(),
        province,
        role,
      };
      const data = await farmApi.signup(payload);

      if (data?.success) {
        Alert.alert("Success", "Account created successfully! Please login.");
        navigation.navigate("Login");
      } else {
        setError(data?.error || "Signup failed");
      }
    } catch (err) {
      setError(err.message || "Cannot connect to server. Check if backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.logo}>
        <Fish size={32} color="#FFFFFF" />
      </View>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Start managing your fish farm</Text>

      <View style={styles.card}>
        <Field label="Full Name" value={name} onChangeText={setName} placeholder="Enter your name" />
        <Field
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Create a password"
          secureTextEntry
        />

        <Text style={styles.label}>Account Type</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={role} onValueChange={setRole} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
            <Picker.Item label="Farmer" value="user" />
            <Picker.Item label="Buyer / Consumer" value="Consumer" />
          </Picker>
        </View>

        {role === "user" && (
          <Field
            label="Farm Name"
            value={farmName}
            onChangeText={setFarmName}
            placeholder="Your farm name"
          />
        )}

        <Field label="City / District" value={city} onChangeText={setCity} placeholder="Enter your city/district" />

        <Text style={styles.label}>Province</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={province} onValueChange={setProvince} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
            <Picker.Item label="Select your province" value="" />
            <Picker.Item label="Punjab" value="Punjab" />
            <Picker.Item label="Sindh" value="Sindh" />
            <Picker.Item label="Khyber Pakhtunkhwa" value="Khyber Pakhtunkhwa" />
            <Picker.Item label="Balochistan" value="Balochistan" />
            <Picker.Item label="Gilgit-Baltistan" value="Gilgit-Baltistan" />
            <Picker.Item label="Islamabad Capital Territory" value="Islamabad Capital Territory" />
          </Picker>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Create Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Login")}>
          <Text style={styles.footerText}>
            Already have an account? <Text style={styles.link}>Login</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#9CA3AF" style={styles.input} {...props} />
    </View>
  );
}

export default SignUp;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  container: {
    padding: 20,
    paddingTop: 34,
    paddingBottom: 34,
  },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    color: "#111827",
    fontSize: 25,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  field: {
    marginBottom: 14,
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 13,
    color: "#111827",
    fontSize: 15,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  picker: {
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  pickerItem: {
    color: "#111827",
  },
  error: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    color: "#DC2626",
    textAlign: "center",
    padding: 8,
    borderRadius: 8,
    marginBottom: 14,
    fontSize: 12,
    fontWeight: "700",
  },
  button: {
    height: 50,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15,
  },
  footerText: {
    color: "#64748B",
    textAlign: "center",
    marginTop: 22,
    fontSize: 14,
  },
  link: {
    color: "#2563EB",
    fontWeight: "900",
  },
});

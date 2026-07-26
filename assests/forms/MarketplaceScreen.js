import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import {
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  RefreshCw,
  Send,
  ShoppingCart,
  Star,
  Trash2,
} from "lucide-react-native";
import { AppScaffold, Card, EmptyState, PrimaryButton, Tag } from "../compoents/AppScaffold";
import {
  farmApi,
  getPurchaseRequestStatus,
  getSession,
  isPurchaseRequestOpen,
} from "../integration/farmApi";

const sortOptions = [
  { label: "Default", value: "default" },
  { label: "Favorites only", value: "favorites" },
  { label: "Price: low to high", value: "price_asc" },
  { label: "Price: high to low", value: "price_desc" },
  { label: "Species: A-Z", value: "alpha" },
  { label: "Quantity: high to low", value: "quantity" },
  { label: "Quantity: low to high", value: "quantity_asc" },
  { label: "Highest rating", value: "rating" },
  { label: "Recently stocked", value: "recent" },
];

const statusColor = status => {
  const normalized = String(status || "").trim();
  if (normalized === "Approved") return styles.statusApproved;
  if (normalized === "Denied") return styles.statusDenied;
  if (normalized === "Replied") return styles.statusReplied;
  return styles.statusPending;
};

const formatDate = value => {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString();
};

const availableQuantity = item =>
  Number(item.IsForSale === 1 ? item.QuantityForSale || 0 : item.TotalQuantity || 0);

export default function MarketplaceScreen({ navigation }) {
  const session = getSession();
  const user = session.user || {};
  const [activeTab, setActiveTab] = useState("market");
  const [listings, setListings] = useState([]);
  const [regions, setRegions] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [consumerRequests, setConsumerRequests] = useState([]);
  const [farmerRequests, setFarmerRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [searchTerm, setSearchTerm] = useState("");
  const [purchaseModal, setPurchaseModal] = useState(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [submittingPurchase, setSubmittingPurchase] = useState(false);
  const [reviewsModal, setReviewsModal] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [approvingRequest, setApprovingRequest] = useState(null);
  const [approvePrice, setApprovePrice] = useState("");
  const [processingAction, setProcessingAction] = useState(null);

  const loadListings = async (regionId = selectedRegion) => {
    setLoading(true);
    setError(null);
    try {
      const result = await farmApi.getMarketplaceListings(
        undefined,
        undefined,
        regionId || undefined,
      );
      if (result?.success) {
        setListings(result.data || []);
      } else {
        setError(result?.error || "Failed to load marketplace listings.");
      }
    } catch (err) {
      setError(err.message || "Could not load marketplace listings.");
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const [consumer, farmer] = await Promise.all([
        farmApi.getConsumerRequests().catch(() => ({ success: false, data: [] })),
        farmApi.getFarmerRequests().catch(() => ({ success: false, data: [] })),
      ]);
      if (consumer?.success) setConsumerRequests(consumer.data || []);
      if (farmer?.success) setFarmerRequests(farmer.data || []);
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [regionResult, favoriteResult] = await Promise.all([
        farmApi.getMarketplaceRegions().catch(() => ({ success: false, data: [] })),
        farmApi.getFavorites().catch(() => ({ success: false, data: [] })),
      ]);
      if (regionResult?.success) setRegions(regionResult.data || []);
      if (favoriteResult?.success) setFavorites(favoriteResult.data || []);
      await Promise.all([loadListings(""), loadRequests()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredListings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const searched = term
      ? listings.filter(item =>
          String(item.SpeciesName || "").toLowerCase().includes(term),
        )
      : listings;
    const filtered =
      sortBy === "favorites"
        ? searched.filter(item => favorites.includes(item.FarmId))
        : searched;
    return [...filtered].sort((a, b) => {
      if (sortBy === "quantity") return availableQuantity(b) - availableQuantity(a);
      if (sortBy === "quantity_asc") return availableQuantity(a) - availableQuantity(b);
      if (sortBy === "price_asc") {
        const pa = a.IsForSale === 1 && a.SalePricePerUnit ? Number(a.SalePricePerUnit) : Infinity;
        const pb = b.IsForSale === 1 && b.SalePricePerUnit ? Number(b.SalePricePerUnit) : Infinity;
        return pa - pb;
      }
      if (sortBy === "price_desc") {
        const pa = a.IsForSale === 1 && a.SalePricePerUnit ? Number(a.SalePricePerUnit) : -1;
        const pb = b.IsForSale === 1 && b.SalePricePerUnit ? Number(b.SalePricePerUnit) : -1;
        return pb - pa;
      }
      if (sortBy === "alpha") return String(a.SpeciesName || "").localeCompare(String(b.SpeciesName || ""));
      if (sortBy === "rating") return Number(b.AverageRating || 0) - Number(a.AverageRating || 0);
      if (sortBy === "recent") return new Date(b.LastStocked || 0) - new Date(a.LastStocked || 0);
      return 0;
    });
  }, [favorites, listings, searchTerm, sortBy]);

  const hasUnreadReplies = consumerRequests.some(req => {
    const status = getPurchaseRequestStatus(req);
    return status === "Replied" || status === "Approved";
  });
  const pendingFarmerCount = farmerRequests.filter(isPurchaseRequestOpen).length;

  const sendEmail = item => {
    if (!item.FarmerEmail && !item.ConsumerEmail) {
      Alert.alert("Message", "No email is available for this contact.");
      return;
    }
    const email = item.FarmerEmail || item.ConsumerEmail;
    const subject = encodeURIComponent(`Fish Marketplace: ${item.SpeciesName || "Request"}`);
    Linking.openURL(`mailto:${email}?subject=${subject}`).catch(() => {
      Alert.alert("Message", "Could not open email app.");
    });
  };

  const toggleFavorite = async farmId => {
    const isFavorite = favorites.includes(farmId);
    setFavorites(prev => (isFavorite ? prev.filter(id => id !== farmId) : [...prev, farmId]));
    try {
      await farmApi.toggleFavorite(farmId);
    } catch (err) {
      setFavorites(prev => (isFavorite ? [...prev, farmId] : prev.filter(id => id !== farmId)));
      Alert.alert("Favorites", err.message || "Could not update favorite.");
    }
  };

  const submitPurchaseRequest = async () => {
    if (!purchaseModal) return;
    const qty = Math.floor(Number(purchaseQuantity || 0));
    if (!qty || qty <= 0 || qty > Number(purchaseModal.maxQuantity || 0)) {
      Alert.alert("Request", `Enter a quantity up to ${purchaseModal.maxQuantity}.`);
      return;
    }
    setSubmittingPurchase(true);
    try {
      await farmApi.createPurchaseRequest({
        farmId: purchaseModal.farmId,
        speciesName: purchaseModal.speciesName,
        requestedQuantity: qty,
      });
      setPurchaseModal(null);
      setPurchaseQuantity("");
      await loadRequests();
      Alert.alert("Request sent", "Your purchase request was sent to the farmer.");
    } catch (err) {
      Alert.alert("Request", err.message || "Could not submit purchase request.");
    } finally {
      setSubmittingPurchase(false);
    }
  };

  const openReviews = async item => {
    setReviewsModal(item);
    setRatings([]);
    setRatingValue(0);
    setRatingComment("");
    setRatingLoading(true);
    try {
      const result = await farmApi.getFarmRatings(item.FarmId);
      if (result?.success) setRatings(result.data || []);
    } catch (err) {
      Alert.alert("Reviews", err.message || "Could not load reviews.");
    } finally {
      setRatingLoading(false);
    }
  };

  const submitRating = async () => {
    if (!reviewsModal || ratingValue < 1) {
      Alert.alert("Review", "Select a star rating first.");
      return;
    }
    setRatingLoading(true);
    try {
      await farmApi.rateFarm(reviewsModal.FarmId, ratingValue, ratingComment);
      const result = await farmApi.getFarmRatings(reviewsModal.FarmId);
      if (result?.success) setRatings(result.data || []);
      setRatingValue(0);
      setRatingComment("");
      await loadListings(selectedRegion);
    } catch (err) {
      Alert.alert("Review", err.message || "Could not submit review.");
    } finally {
      setRatingLoading(false);
    }
  };

  const deleteRequest = (requestId, type = "consumer") => {
    Alert.alert("Delete Request", "Remove this request?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setProcessingAction(requestId);
          try {
            await farmApi.deletePurchaseRequest(requestId);
            await loadRequests();
          } catch (err) {
            Alert.alert("Request", err.message || `Could not delete ${type} request.`);
          } finally {
            setProcessingAction(null);
          }
        },
      },
    ]);
  };

  const submitReply = async requestId => {
    if (!replyMessage.trim()) {
      Alert.alert("Reply", "Write a message for the consumer.");
      return;
    }
    setProcessingAction(requestId);
    try {
      await farmApi.replyToPurchaseRequest(requestId, {
        replyMessage: replyMessage.trim(),
      });
      setReplyingTo(null);
      setReplyMessage("");
      await loadRequests();
    } catch (err) {
      Alert.alert("Reply", err.message || "Could not send reply.");
    } finally {
      setProcessingAction(null);
    }
  };

  const denyRequest = async requestId => {
    setProcessingAction(requestId);
    try {
      await farmApi.denyPurchaseRequest(requestId);
      await loadRequests();
    } catch (err) {
      Alert.alert("Request", err.message || "Could not deny request.");
    } finally {
      setProcessingAction(null);
    }
  };

  const approveRequest = async () => {
    if (!approvingRequest) return;
    const finalPrice =
      approvePrice.trim() === "" ? null : Number(approvePrice.trim());
    if (finalPrice !== null && (!Number.isFinite(finalPrice) || finalPrice < 0)) {
      Alert.alert("Approve", "Enter a valid final sale price.");
      return;
    }
    setProcessingAction(approvingRequest.RequestId);
    try {
      const result = await farmApi.approvePurchaseRequest(approvingRequest.RequestId, { finalPrice });
      if (!result?.success) {
        throw new Error(result?.error || "Could not approve request.");
      }
      const approvedId = Number(approvingRequest.RequestId);
      setFarmerRequests(prev =>
        prev.map(item =>
          Number(item.RequestId) === approvedId
            ? {
                ...item,
                ...(result.data || {}),
                Status: getPurchaseRequestStatus(result.data || { Status: "Approved" }),
              }
            : item,
        ),
      );
      setApprovingRequest(null);
      setApprovePrice("");
      await Promise.all([loadRequests(), loadListings(selectedRegion)]);
      Alert.alert("Approved", result?.message || "Request approved and stock updated.");
    } catch (err) {
      Alert.alert("Approve", err.message || "Could not approve request.");
    } finally {
      setProcessingAction(null);
    }
  };

  const renderStars = (count, size = 15) => (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          size={size}
          color={star <= Math.round(Number(count || 0)) ? "#F59E0B" : "#D1D5DB"}
          fill={star <= Math.round(Number(count || 0)) ? "#F59E0B" : "transparent"}
        />
      ))}
    </View>
  );

  return (
    <AppScaffold
      title="Fish Marketplace"
      subtitle={`Buy, request, review, and manage fish sales${user?.name ? `, ${user.name}` : ""}`}
      navigation={navigation}
      currentRoute="Marketplace"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {[
          { id: "market", label: "Marketplace" },
          { id: "myRequests", label: `My Requests${hasUnreadReplies ? " !" : ""}` },
          { id: "incoming", label: `Incoming${pendingFarmerCount ? ` (${pendingFarmerCount})` : ""}` },
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.activeTab]}
            onPress={() => {
              setActiveTab(tab.id);
              if (tab.id !== "market") loadRequests();
            }}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {activeTab === "market" && (
        <>
          <Card>
            <View style={styles.headerRow}>
              <View style={styles.flexOne}>
                <Text style={styles.title}>Available Fish by Region</Text>
                <Text style={styles.muted}>Search, sort, request to buy, favorite farms, and review farmers.</Text>
              </View>
              <TouchableOpacity style={styles.iconAction} onPress={() => loadInitial()}>
                <RefreshCw size={18} color="#2563EB" />
              </TouchableOpacity>
            </View>
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              style={styles.input}
              placeholder="Search species, e.g. Rohu"
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={selectedRegion}
                onValueChange={value => {
                  const next = String(value || "");
                  setSelectedRegion(next);
                  loadListings(next);
                }}
              >
                <Picker.Item label="All regions" value="" />
                {regions.map(region => (
                  <Picker.Item
                    key={String(region.RegionId)}
                    label={`${region.RegionName}${region.Province ? ` (${region.Province})` : ""}`}
                    value={String(region.RegionId)}
                  />
                ))}
              </Picker>
            </View>
            <View style={styles.pickerBox}>
              <Picker selectedValue={sortBy} onValueChange={value => setSortBy(String(value || "default"))}>
                {sortOptions.map(option => (
                  <Picker.Item key={option.value} label={option.label} value={option.value} />
                ))}
              </Picker>
        </View>
      </Card>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
              <PrimaryButton title="Try Again" onPress={() => loadListings(selectedRegion)} />
        </Card>
          ) : filteredListings.length === 0 ? (
            <EmptyState title="No matching fish found" text="Clear filters or check back later for new listings." />
      ) : (
            filteredListings.map(item => {
              const isFavorite = favorites.includes(item.FarmId);
              const qty = availableQuantity(item);
              return (
          <Card key={`${item.FarmId}-${item.SpeciesName}`}>
            <View style={styles.listingTop}>
                    <View style={styles.tagWrap}>
              <Tag>{item.SpeciesName}</Tag>
                      <Text style={[styles.saleBadge, item.IsForSale === 1 ? styles.forSale : styles.growing]}>
                        {item.IsForSale === 1 ? "For Sale" : "Growing"}
              </Text>
            </View>
                    <TouchableOpacity onPress={() => toggleFavorite(item.FarmId)}>
                      <Heart size={24} color={isFavorite ? "#EF4444" : "#9CA3AF"} fill={isFavorite ? "#EF4444" : "transparent"} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.quantity}>{qty.toLocaleString()} fish</Text>
                  {qty < 1000 && <Text style={styles.lowStock}>Low stock</Text>}
                  {qty >= 5000 && <Text style={styles.highStock}>High availability</Text>}
            <Text style={styles.size}>Avg Size: {Number(item.AvgSizeInches || 0).toFixed(1)}"</Text>
                  {item.IsForSale === 1 && item.SalePricePerUnit ? (
                    <Text style={styles.price}>PKR {Number(item.SalePricePerUnit).toLocaleString()} / fish</Text>
                  ) : null}
                  <Text style={styles.meta}>Stocked: {formatDate(item.LastStocked)}</Text>

            <View style={styles.farmRow}>
              <MapPin size={18} color="#6B7280" />
                    <View style={styles.flexOne}>
                <Text style={styles.farmName}>{item.FarmName || "Unnamed Farm"}</Text>
                <Text style={styles.meta}>Farmer: {item.FarmerName || "N/A"}</Text>
                      {!!item.RegionName && <Text style={styles.region}>{item.RegionName}</Text>}
              </View>
            </View>

                  <TouchableOpacity style={styles.reviewButton} onPress={() => openReviews(item)}>
                    {renderStars(item.AverageRating, 13)}
                    <Text style={styles.reviewText}>
                      {Number(item.TotalReviews || 0) > 0
                        ? `${item.TotalReviews} review${Number(item.TotalReviews) === 1 ? "" : "s"}`
                        : "No ratings yet - review"}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.actionRow}>
                    {item.IsForSale === 1 ? (
                      <PrimaryButton
                        title="Request to Buy"
                        onPress={() =>
                          setPurchaseModal({
                            farmId: item.FarmId,
                            farmName: item.FarmName,
                            speciesName: item.SpeciesName,
                            maxQuantity: item.QuantityForSale || 0,
                            salePricePerUnit: item.SalePricePerUnit || null,
                          })
                        }
                        style={styles.flexOne}
                      />
                    ) : (
                      <View style={[styles.disabledAction, styles.flexOne]}>
                        <Text style={styles.disabledText}>Not for sale</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.smallAction} onPress={() => sendEmail(item)}>
                      <Mail size={16} color="#111827" />
                      <Text style={styles.smallActionText}>Message</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          )}
        </>
      )}

      {activeTab === "myRequests" && (
        <RequestList
          data={consumerRequests}
          loading={requestsLoading}
          emptyTitle="No purchase requests yet"
          perspective="consumer"
          onDelete={id => deleteRequest(id, "consumer")}
        />
      )}

      {activeTab === "incoming" && (
        <FarmerRequestList
          data={farmerRequests}
          loading={requestsLoading}
          processingAction={processingAction}
          replyingTo={replyingTo}
          replyMessage={replyMessage}
          approvingRequest={approvingRequest}
          approvePrice={approvePrice}
          onReplyingTo={setReplyingTo}
          onReplyMessage={setReplyMessage}
          onSubmitReply={submitReply}
          onApproveStart={setApprovingRequest}
          onApprovePrice={setApprovePrice}
          onApproveConfirm={approveRequest}
          onApproveCancel={() => {
            setApprovingRequest(null);
            setApprovePrice("");
          }}
          onDeny={denyRequest}
          onDelete={id => deleteRequest(id, "farmer")}
          onMessage={sendEmail}
        />
      )}

      <PurchaseModal
        data={purchaseModal}
        quantity={purchaseQuantity}
        saving={submittingPurchase}
        onQuantity={setPurchaseQuantity}
        onClose={() => {
          setPurchaseModal(null);
          setPurchaseQuantity("");
        }}
        onSubmit={submitPurchaseRequest}
      />

      <ReviewsModal
        data={reviewsModal}
        ratings={ratings}
        loading={ratingLoading}
        ratingValue={ratingValue}
        comment={ratingComment}
        onRating={setRatingValue}
        onComment={setRatingComment}
        onClose={() => setReviewsModal(null)}
        onSubmit={submitRating}
        renderStars={renderStars}
      />
    </AppScaffold>
  );
}

function RequestList({ data, loading, emptyTitle, perspective, onDelete }) {
  if (loading) return <ActivityIndicator size="large" color="#059669" />;
  if (!data.length) return <EmptyState title={emptyTitle} text="Requests and farmer replies will appear here." />;
  return data.map(req => (
    <Card key={String(req.RequestId)}>
      <View style={styles.requestTop}>
        <View style={styles.flexOne}>
          <Text style={styles.title}>{req.SpeciesName}</Text>
          <Text style={styles.meta}>
            {perspective === "consumer"
              ? req.FarmName || "Unnamed Farm"
              : `${req.ConsumerName || "Consumer"} (${req.ConsumerEmail || "no email"})`}
          </Text>
        </View>
        <Text style={[styles.statusBadge, statusColor(getPurchaseRequestStatus(req))]}>
          {getPurchaseRequestStatus(req)}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Requested Quantity</Text>
        <Text style={styles.detailValue}>{Number(req.RequestedQuantity || 0).toLocaleString()}</Text>
      </View>
      <Text style={styles.meta}>Created: {formatDate(req.CreatedAt)}</Text>
      {!!req.FarmerReply && (
        <View style={styles.replyBox}>
          <Text style={styles.replyTitle}>{perspective === "consumer" ? "Farmer Reply" : "Your Reply"}</Text>
          <Text style={styles.replyText}>{req.FarmerReply}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(req.RequestId)}>
        <Trash2 size={15} color="#DC2626" />
        <Text style={styles.deleteText}>Delete Request</Text>
      </TouchableOpacity>
    </Card>
  ));
}

function FarmerRequestList(props) {
  const {
    data,
    loading,
    processingAction,
    replyingTo,
    replyMessage,
    approvingRequest,
    approvePrice,
    onReplyingTo,
    onReplyMessage,
    onSubmitReply,
    onApproveStart,
    onApprovePrice,
    onApproveConfirm,
    onApproveCancel,
    onDeny,
    onDelete,
    onMessage,
  } = props;
  if (loading) return <ActivityIndicator size="large" color="#059669" />;
  if (!data.length) return <EmptyState title="No incoming purchase requests" text="Consumer requests for your listed fish will appear here." />;

  return data.map(req => (
    <Card key={String(req.RequestId)}>
      <View style={styles.requestTop}>
        <View style={styles.flexOne}>
          <Text style={styles.title}>{req.SpeciesName}</Text>
          <Text style={styles.meta}>From: {req.ConsumerName || "Consumer"} ({req.ConsumerEmail || "no email"})</Text>
        </View>
        <Text style={[styles.statusBadge, statusColor(getPurchaseRequestStatus(req))]}>
          {getPurchaseRequestStatus(req)}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Requested Quantity</Text>
        <Text style={styles.detailValue}>{Number(req.RequestedQuantity || 0).toLocaleString()}</Text>
      </View>

      {approvingRequest?.RequestId === req.RequestId && (
        <View style={styles.approveBox}>
          <Text style={styles.replyTitle}>Confirm Sale</Text>
          <Text style={styles.muted}>Leave price blank to use sale price from stock batches.</Text>
          <TextInput value={approvePrice} onChangeText={onApprovePrice} keyboardType="decimal-pad" style={styles.input} placeholder="Final sale price (PKR)" placeholderTextColor="#9CA3AF" />
          <View style={styles.actionRow}>
            <PrimaryButton title="Confirm Sale" onPress={onApproveConfirm} style={styles.flexOne} />
            <TouchableOpacity style={styles.smallAction} onPress={onApproveCancel}>
              <Text style={styles.smallActionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isPurchaseRequestOpen(req) &&
        replyingTo !== req.RequestId &&
        approvingRequest?.RequestId !== req.RequestId && (
          <View style={styles.wrapActions}>
            <TouchableOpacity style={styles.approveButton} onPress={() => onApproveStart(req)}>
              <Text style={styles.approveText}>Approve & Sell</Text>
            </TouchableOpacity>
            {getPurchaseRequestStatus(req) === "Pending" && (
              <TouchableOpacity style={styles.replyButton} onPress={() => onReplyingTo(req.RequestId)}>
                <Send size={14} color="#1D4ED8" />
                <Text style={styles.replyButtonText}>Reply</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.neutralButton} onPress={() => onDeny(req.RequestId)} disabled={processingAction === req.RequestId}>
              <Text style={styles.neutralText}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.neutralButton} onPress={() => onMessage(req)}>
              <MessageCircle size={14} color="#374151" />
              <Text style={styles.neutralText}>Message</Text>
            </TouchableOpacity>
          </View>
        )}

      {replyingTo === req.RequestId && (
        <View style={styles.replyBox}>
          <Text style={styles.replyTitle}>Send Reply</Text>
          <TextInput value={replyMessage} onChangeText={onReplyMessage} multiline style={[styles.input, styles.textArea]} placeholder="Pickup instructions, phone, or location details..." placeholderTextColor="#9CA3AF" />
          <View style={styles.actionRow}>
            <PrimaryButton title="Send Reply" onPress={() => onSubmitReply(req.RequestId)} style={styles.flexOne} />
            <TouchableOpacity style={styles.smallAction} onPress={() => onReplyingTo(null)}>
              <Text style={styles.smallActionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!!req.FarmerReply && (
        <View style={styles.replyBox}>
          <Text style={styles.replyTitle}>Current Reply</Text>
          <Text style={styles.replyText}>{req.FarmerReply}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(req.RequestId)}>
        <Trash2 size={15} color="#DC2626" />
        <Text style={styles.deleteText}>Delete Request</Text>
      </TouchableOpacity>
          </Card>
  ));
}

function PurchaseModal({ data, quantity, saving, onQuantity, onClose, onSubmit }) {
  if (!data) return null;
  const estimated = Number(quantity || 0) * Number(data.salePricePerUnit || 0);
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Request to Buy</Text>
          <Text style={styles.muted}>from {data.farmName || "Unnamed Farm"}</Text>
          <Text style={styles.title}>{data.speciesName}</Text>
          <Text style={styles.label}>Quantity Required (Max: {Number(data.maxQuantity || 0).toLocaleString()})</Text>
          <TextInput value={quantity} onChangeText={onQuantity} keyboardType="number-pad" style={styles.input} placeholder="e.g. 500" placeholderTextColor="#9CA3AF" />
          {estimated > 0 && (
            <View style={styles.estimateBox}>
              <Text style={styles.estimateLabel}>Estimated Cost</Text>
              <Text style={styles.estimateValue}>PKR {estimated.toLocaleString()}</Text>
            </View>
          )}
          <PrimaryButton title={saving ? "Sending..." : "Send Request to Farmer"} onPress={onSubmit} disabled={saving} />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ReviewsModal({ data, ratings, loading, ratingValue, comment, onRating, onComment, onClose, onSubmit, renderStars }) {
  if (!data) return null;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, styles.modalTall]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{data.FarmName || "Farm"} Reviews</Text>
            <Text style={styles.muted}>{ratings.length} review{ratings.length === 1 ? "" : "s"}</Text>
            <View style={styles.reviewForm}>
              <Text style={styles.replyTitle}>Write a Review</Text>
              <View style={styles.starPickRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity key={star} onPress={() => onRating(star)}>
                    <Star size={30} color={star <= ratingValue ? "#F59E0B" : "#D1D5DB"} fill={star <= ratingValue ? "#F59E0B" : "transparent"} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput value={comment} onChangeText={onComment} multiline style={[styles.input, styles.textArea]} placeholder="What was your buying experience?" placeholderTextColor="#9CA3AF" />
              <PrimaryButton title="Submit Review" onPress={onSubmit} disabled={loading || ratingValue < 1} />
            </View>
            {loading ? (
              <ActivityIndicator color="#2563EB" />
            ) : ratings.length === 0 ? (
              <Text style={styles.muted}>No reviews yet. Be the first to rate.</Text>
            ) : (
              ratings.map(item => (
                <View key={String(item.RatingId || item.CreatedAt)} style={styles.reviewItem}>
                  <View style={styles.requestTop}>
                    <Text style={styles.farmName}>{item.RetailerName || "Consumer"}</Text>
                    {renderStars(item.RatingValue)}
                  </View>
                  <Text style={styles.replyText}>{item.Comment || "No comment provided."}</Text>
                  <Text style={styles.meta}>{formatDate(item.CreatedAt)}</Text>
                </View>
              ))
            )}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingBottom: 12 },
  tab: { backgroundColor: "#F3F4F6", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  activeTab: { backgroundColor: "#2563EB" },
  tabText: { color: "#6B7280", fontWeight: "900" },
  activeTabText: { color: "#FFFFFF" },
  flexOne: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#111827", fontSize: 17, fontWeight: "900" },
  muted: { color: "#6B7280", marginTop: 4 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, minHeight: 46, color: "#111827", backgroundColor: "#FFFFFF", marginTop: 10 },
  pickerBox: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, backgroundColor: "#FFFFFF", marginTop: 10, overflow: "hidden" },
  iconAction: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF6FF" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" },
  wrapActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  errorCard: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  errorText: { color: "#DC2626", fontWeight: "800", textAlign: "center", marginBottom: 12 },
  listingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  saleBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: "900", overflow: "hidden" },
  forSale: { color: "#047857", backgroundColor: "#D1FAE5" },
  growing: { color: "#6B7280", backgroundColor: "#F3F4F6" },
  quantity: { color: "#111827", fontSize: 24, fontWeight: "900" },
  lowStock: { color: "#B91C1C", fontWeight: "900", marginTop: 4 },
  highStock: { color: "#047857", fontWeight: "900", marginTop: 4 },
  size: { color: "#111827", fontSize: 16, fontWeight: "800", marginTop: 8 },
  price: { color: "#047857", fontSize: 16, fontWeight: "900", marginTop: 4 },
  meta: { color: "#6B7280", marginTop: 4 },
  farmRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  farmName: { color: "#111827", fontWeight: "900" },
  region: { color: "#2563EB", fontWeight: "800", marginTop: 4 },
  starRow: { flexDirection: "row", gap: 2, alignItems: "center" },
  reviewButton: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  reviewText: { color: "#2563EB", fontWeight: "800" },
  smallAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, minHeight: 44 },
  smallActionText: { color: "#111827", fontWeight: "900" },
  disabledAction: { backgroundColor: "#F3F4F6", borderRadius: 10, minHeight: 44, alignItems: "center", justifyContent: "center" },
  disabledText: { color: "#9CA3AF", fontWeight: "900" },
  requestTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: "900", overflow: "hidden" },
  statusPending: { color: "#B45309", backgroundColor: "#FEF3C7" },
  statusReplied: { color: "#047857", backgroundColor: "#D1FAE5" },
  statusApproved: { color: "#166534", backgroundColor: "#DCFCE7" },
  statusDenied: { color: "#B91C1C", backgroundColor: "#FEE2E2" },
  detailRow: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  detailLabel: { color: "#6B7280", fontWeight: "700" },
  detailValue: { color: "#111827", fontWeight: "900" },
  replyBox: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  replyTitle: { color: "#111827", fontWeight: "900", marginBottom: 6 },
  replyText: { color: "#374151", lineHeight: 20 },
  deleteButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginTop: 12, padding: 8 },
  deleteText: { color: "#DC2626", fontWeight: "900" },
  approveBox: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  approveButton: { backgroundColor: "#16A34A", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  approveText: { color: "#FFFFFF", fontWeight: "900" },
  replyButton: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  replyButtonText: { color: "#1D4ED8", fontWeight: "900" },
  neutralButton: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  neutralText: { color: "#374151", fontWeight: "900" },
  textArea: { minHeight: 92, textAlignVertical: "top", paddingTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "center", padding: 18 },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 18, maxHeight: "90%" },
  modalTall: { minHeight: "70%" },
  modalTitle: { color: "#111827", fontSize: 21, fontWeight: "900" },
  label: { color: "#374151", fontWeight: "900", marginTop: 14 },
  estimateBox: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center", marginVertical: 12 },
  estimateLabel: { color: "#047857", fontSize: 12, fontWeight: "900" },
  estimateValue: { color: "#065F46", fontSize: 20, fontWeight: "900" },
  closeButton: { alignItems: "center", paddingVertical: 12, marginTop: 8 },
  closeText: { color: "#6B7280", fontWeight: "900" },
  reviewForm: { backgroundColor: "#F8FAFC", borderColor: "#E5E7EB", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  starPickRow: { flexDirection: "row", gap: 10, marginVertical: 10 },
  reviewItem: { borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingVertical: 12 },
});

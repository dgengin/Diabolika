uniform sampler2D texture;
uniform vec2 textureSize;
uniform vec4 fade;
uniform float gamma;

vec3 Gamma(vec3 value, float param)
{
	return vec3(pow(abs(value.r), param), pow(abs(value.g), param), pow(abs(value.b), param));
}

const vec3 dtt = vec3(65536.0,255.0,1.0);
const   vec3 Y          = vec3(0.299, 0.587, 0.114);

#define BLEND_NONE 0
#define BLEND_NORMAL 1
#define BLEND_DOMINANT 2
#define LUMINANCE_WEIGHT 1.0
#define EQUAL_COLOR_TOLERANCE 30.0/255.0
#define STEEP_DIRECTION_THRESHOLD 2.2
#define DOMINANT_DIRECTION_THRESHOLD 3.6

float reduce(vec3 color)
{
	return dot(color, dtt);
}

float DistYCbCr(const vec3 pixA, const vec3 pixB)
{
	return dot(abs(pixA-pixB), Y);
}

bool IsPixEqual(const vec3 pixA, const vec3 pixB)
{
	return (DistYCbCr(pixA, pixB) < EQUAL_COLOR_TOLERANCE);
}

bool IsBlendingNeeded(const ivec4 blend)
{
	return any(notEqual(blend, ivec4(BLEND_NONE)));
}

// Output Pixel Mapping:  06|07|08|09
//                        05|00|01|10
//                        04|03|02|11
//                        15|14|13|12

void main()
{
	vec2 OGLInvSize = vec2(1.0)/textureSize;
	vec2 f = fract(gl_TexCoord[0].xy*textureSize);
	vec2 TexCoord_0 = gl_TexCoord[0].xy-f*OGLInvSize + 0.5*OGLInvSize;

	vec2 siggn = vec2(1.0,1.0);

	if (f.x >= 0.5) { f.x = 1.0 - f.x; siggn.x = -1.0; }
	if (f.y >= 0.5) { f.y = 1.0 - f.y; siggn.y = -1.0; }

	float x = OGLInvSize.x;
	float y = OGLInvSize.y;

	vec2 dx         = vec2( x, 0.0)*siggn.x;
	vec2 dy         = vec2( 0.0, y)*siggn.y;
	vec2 x2         = vec2( 2.0*x , 0.0)*siggn.x;
	vec2 y2         = vec2( 0.0 , 2.0*y)*siggn.y;
	vec4 xy         = vec4( x, y,-x,-y)*siggn.xyxy;
	vec4 zw         = vec4( 2.0*x , y,-2.0*x ,-y)*siggn.xyxy;
	vec4 wz         = vec4( x, 2.0*y ,-x,-2.0*y )*siggn.xyxy;

	vec3 src[25];

	src[ 6] = texture2D(texture, TexCoord_0 + xy.zw ).xyz;
	src[ 7] = texture2D(texture, TexCoord_0     -dy ).xyz;
	src[ 8] = texture2D(texture, TexCoord_0 + xy.xw ).xyz;
	src[ 5] = texture2D(texture, TexCoord_0 - dx    ).xyz;
	src[ 0] = texture2D(texture, TexCoord_0         ).xyz;
	src[ 1] = texture2D(texture, TexCoord_0 + dx    ).xyz;
	src[ 4] = texture2D(texture, TexCoord_0 + xy.zy ).xyz;
	src[ 3] = texture2D(texture, TexCoord_0     +dy ).xyz;
	src[ 2] = texture2D(texture, TexCoord_0 + xy.xy ).xyz;
	src[21] = texture2D(texture, TexCoord_0 + wz.zw ).xyz;
	src[23] = texture2D(texture, TexCoord_0 + wz.xw ).xyz;
	src[19] = texture2D(texture, TexCoord_0 + zw.zw ).xyz;
	src[17] = texture2D(texture, TexCoord_0 + zw.zy ).xyz;
	src[ 9] = texture2D(texture, TexCoord_0 + zw.xw ).xyz;
	src[11] = texture2D(texture, TexCoord_0 + zw.xy ).xyz;
	src[15] = texture2D(texture, TexCoord_0 + wz.zy ).xyz;
	src[13] = texture2D(texture, TexCoord_0 + wz.xy ).xyz;
	src[22] = texture2D(texture, TexCoord_0 - y2    ).xyz;
	src[18] = texture2D(texture, TexCoord_0 - x2    ).xyz;
	src[14] = texture2D(texture, TexCoord_0 + y2    ).xyz;
	src[10] = texture2D(texture, TexCoord_0 + x2    ).xyz;

	float v[9];
	v[0] = reduce(src[0]);
	v[1] = reduce(src[1]);
	v[2] = reduce(src[2]);
	v[3] = reduce(src[3]);
	v[4] = reduce(src[4]);
	v[5] = reduce(src[5]);
	v[6] = reduce(src[6]);
	v[7] = reduce(src[7]);
	v[8] = reduce(src[8]);

	ivec4 blendResult = ivec4(BLEND_NONE);

	// Preprocess corners
	// Pixel Tap Mapping: --|--|--|--|--
	//                    --|--|07|08|--
	//                    --|05|00|01|10
	//                    --|04|03|02|11
	//                    --|--|14|13|--
	// Corner (1, 1)
	if ( !((v[0] == v[1] && v[3] == v[2]) || (v[0] == v[3] && v[1] == v[2])) )
	{
		float dist_03_01 = DistYCbCr(src[ 4], src[ 0]) + DistYCbCr(src[ 0], src[ 8]) + DistYCbCr(src[14], src[ 2]) + DistYCbCr(src[ 2], src[10]) + (4.0 * DistYCbCr(src[ 3], src[ 1]));
		float dist_00_02 = DistYCbCr(src[ 5], src[ 3]) + DistYCbCr(src[ 3], src[13]) + DistYCbCr(src[ 7], src[ 1]) + DistYCbCr(src[ 1], src[11]) + (4.0 * DistYCbCr(src[ 0], src[ 2]));
		bool dominantGradient = (DOMINANT_DIRECTION_THRESHOLD * dist_03_01) < dist_00_02;
		blendResult[2] = ((dist_03_01 < dist_00_02) && (v[0] != v[1]) && (v[0] != v[3])) ? ((dominantGradient) ? BLEND_DOMINANT : BLEND_NORMAL) : BLEND_NONE;
	}

	// Pixel Tap Mapping: --|--|--|--|--
	//                    --|06|07|--|--
	//                    18|05|00|01|--
	//                    17|04|03|02|--
	//                    --|15|14|--|--
	// Corner (0, 1)
	if ( !((v[5] == v[0] && v[4] == v[3]) || (v[5] == v[4] && v[0] == v[3])) )
	{
		float dist_04_00 = DistYCbCr(src[17], src[ 5]) + DistYCbCr(src[ 5], src[ 7]) + DistYCbCr(src[15], src[ 3]) + DistYCbCr(src[ 3], src[ 1]) + (4.0 * DistYCbCr(src[ 4], src[ 0]));
		float dist_05_03 = DistYCbCr(src[18], src[ 4]) + DistYCbCr(src[ 4], src[14]) + DistYCbCr(src[ 6], src[ 0]) + DistYCbCr(src[ 0], src[ 2]) + (4.0 * DistYCbCr(src[ 5], src[ 3]));
		bool dominantGradient = (DOMINANT_DIRECTION_THRESHOLD * dist_05_03) < dist_04_00;
		blendResult[3] = ((dist_04_00 > dist_05_03) && (v[0] != v[5]) && (v[0] != v[3])) ? ((dominantGradient) ? BLEND_DOMINANT : BLEND_NORMAL) : BLEND_NONE;
	}

	// Pixel Tap Mapping: --|--|22|23|--
	//                    --|06|07|08|09
	//                    --|05|00|01|10
	//                    --|--|03|02|--
	//                    --|--|--|--|--
	// Corner (1, 0)
	if ( !((v[7] == v[8] && v[0] == v[1]) || (v[7] == v[0] && v[8] == v[1])) )
	{
		float dist_00_08 = DistYCbCr(src[ 5], src[ 7]) + DistYCbCr(src[ 7], src[23]) + DistYCbCr(src[ 3], src[ 1]) + DistYCbCr(src[ 1], src[ 9]) + (4.0 * DistYCbCr(src[ 0], src[ 8]));
		float dist_07_01 = DistYCbCr(src[ 6], src[ 0]) + DistYCbCr(src[ 0], src[ 2]) + DistYCbCr(src[22], src[ 8]) + DistYCbCr(src[ 8], src[10]) + (4.0 * DistYCbCr(src[ 7], src[ 1]));
		bool dominantGradient = (DOMINANT_DIRECTION_THRESHOLD * dist_07_01) < dist_00_08;
		blendResult[1] = ((dist_00_08 > dist_07_01) && (v[0] != v[7]) && (v[0] != v[1])) ? ((dominantGradient) ? BLEND_DOMINANT : BLEND_NORMAL) : BLEND_NONE;
	}

	// Pixel Tap Mapping: --|21|22|--|--
	//                    19|06|07|08|--
	//                    18|05|00|01|--
	//                    --|04|03|--|--
	//                    --|--|--|--|--
	// Corner (0, 0)
	if ( !((v[6] == v[7] && v[5] == v[0]) || (v[6] == v[5] && v[7] == v[0])) )
	{
		float dist_05_07 = DistYCbCr(src[18], src[ 6]) + DistYCbCr(src[ 6], src[22]) + DistYCbCr(src[ 4], src[ 0]) + DistYCbCr(src[ 0], src[ 8]) + (4.0 * DistYCbCr(src[ 5], src[ 7]));
		float dist_06_00 = DistYCbCr(src[19], src[ 5]) + DistYCbCr(src[ 5], src[ 3]) + DistYCbCr(src[21], src[ 7]) + DistYCbCr(src[ 7], src[ 1]) + (4.0 * DistYCbCr(src[ 6], src[ 0]));
		bool dominantGradient = (DOMINANT_DIRECTION_THRESHOLD * dist_05_07) < dist_06_00;
		blendResult[0] = ((dist_05_07 < dist_06_00) && (v[0] != v[5]) && (v[0] != v[7])) ? ((dominantGradient) ? BLEND_DOMINANT : BLEND_NORMAL) : BLEND_NONE;
	}

	vec3 dst[16];
	dst[ 0] = src[0];
	dst[ 5] = src[0];
	dst[ 6] = src[0];
	dst[ 7] = src[0];

	// Scale pixel
	if (IsBlendingNeeded(blendResult))
	{
		float dist_01_04 = DistYCbCr(src[7], src[2]);
		float dist_03_08 = DistYCbCr(src[1], src[6]);
		bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * dist_01_04 <= dist_03_08) && (v[0] != v[2]) && (v[3] != v[2]);
		bool haveSteepLine   = (STEEP_DIRECTION_THRESHOLD * dist_03_08 <= dist_01_04) && (v[0] != v[6]) && (v[5] != v[6]);
		bool needBlend = (blendResult[1] != BLEND_NONE);
		bool doLineBlend = (  blendResult[1] >= BLEND_DOMINANT ||
						!((blendResult[0] != BLEND_NONE && !IsPixEqual(src[0], src[2])) ||
						(blendResult[2] != BLEND_NONE && !IsPixEqual(src[0], src[6])) ||
						(IsPixEqual(src[2], src[1]) && IsPixEqual(src[1], src[8]) && IsPixEqual(src[8], src[7]) && IsPixEqual(src[7], src[6]) && !IsPixEqual(src[0], src[8])) ) );

		vec3 blendPix = ( DistYCbCr(src[0], src[7]) <= DistYCbCr(src[0], src[1]) ) ? src[7] : src[1];
		dst[ 6] = mix(dst[ 6], blendPix, (needBlend && doLineBlend && haveSteepLine) ? 0.25 : 0.00);
		dst[ 7] = mix(dst[ 7], blendPix, (needBlend && doLineBlend && haveSteepLine) ? 0.75 : 0.00);

		dist_01_04 = DistYCbCr(src[5], src[8]);
		dist_03_08 = DistYCbCr(src[7], src[4]);
		haveShallowLine = (STEEP_DIRECTION_THRESHOLD * dist_01_04 <= dist_03_08) && (v[0] != v[8]) && (v[1] != v[8]);
		haveSteepLine   = (STEEP_DIRECTION_THRESHOLD * dist_03_08 <= dist_01_04) && (v[0] != v[4]) && (v[3] != v[4]);
		needBlend = (blendResult[0] != BLEND_NONE);
		doLineBlend = (  blendResult[0] >= BLEND_DOMINANT ||
						!((blendResult[3] != BLEND_NONE && !IsPixEqual(src[0], src[8])) ||
						(blendResult[1] != BLEND_NONE && !IsPixEqual(src[0], src[4])) ||
						(IsPixEqual(src[8], src[7]) && IsPixEqual(src[7], src[6]) && IsPixEqual(src[6], src[5]) && IsPixEqual(src[5], src[4]) && !IsPixEqual(src[0], src[6])) ) );

		blendPix = ( DistYCbCr(src[0], src[5]) <= DistYCbCr(src[0], src[7]) ) ? src[5] : src[7];
		dst[ 0] = mix(dst[ 0], blendPix, (needBlend && doLineBlend) ? ((haveShallowLine) ? ((haveSteepLine) ? 1.0/3.0 : 0.25) : ((haveSteepLine) ? 0.25 : 0.00)) : 0.00);
		dst[ 5] = mix(dst[ 5], blendPix, (needBlend) ? ((doLineBlend) ? ((haveSteepLine) ? 1.00 : ((haveShallowLine) ? 0.75 : 0.50)) : 0.08677704501) : 0.00);
		dst[ 6] = mix(dst[ 6], blendPix, (needBlend) ? ((doLineBlend) ? 1.00 : 0.6848532563) : 0.00);
		dst[ 7] = mix(dst[ 7], blendPix, (needBlend) ? ((doLineBlend) ? ((haveShallowLine) ? 1.00 : ((haveSteepLine) ? 0.75 : 0.50)) : 0.08677704501) : 0.00);

		dist_01_04 = DistYCbCr(src[3], src[6]);
		dist_03_08 = DistYCbCr(src[5], src[2]);
		haveShallowLine = (STEEP_DIRECTION_THRESHOLD * dist_01_04 <= dist_03_08) && (v[0] != v[6]) && (v[7] != v[6]);
		haveSteepLine   = (STEEP_DIRECTION_THRESHOLD * dist_03_08 <= dist_01_04) && (v[0] != v[2]) && (v[1] != v[2]);
		needBlend = (blendResult[3] != BLEND_NONE);
		doLineBlend = (  blendResult[3] >= BLEND_DOMINANT ||
						!((blendResult[2] != BLEND_NONE && !IsPixEqual(src[0], src[6])) ||
						(blendResult[0] != BLEND_NONE && !IsPixEqual(src[0], src[2])) ||
						(IsPixEqual(src[6], src[5]) && IsPixEqual(src[5], src[4]) && IsPixEqual(src[4], src[3]) && IsPixEqual(src[3], src[2]) && !IsPixEqual(src[0], src[4])) ) );

		blendPix = ( DistYCbCr(src[0], src[3]) <= DistYCbCr(src[0], src[5]) ) ? src[3] : src[5];
		dst[ 5] = mix(dst[ 5], blendPix, (needBlend && doLineBlend && haveShallowLine) ? 0.75 : 0.00);
		dst[ 6] = mix(dst[ 6], blendPix, (needBlend && doLineBlend && haveShallowLine) ? 0.25 : 0.00);
	}

	vec3 res;

	f = step(0.25, f);
	res = mix( mix(dst[6], dst[7], f.x), mix(dst[5], dst[0], f.x), f.y );

	float gamma2 = 1.0 - (0.007 * gamma);
	gl_FragColor.xyz = Gamma(res - fade.xyz, gamma2);
	gl_FragColor.a = 1.0 - fade.a;
}
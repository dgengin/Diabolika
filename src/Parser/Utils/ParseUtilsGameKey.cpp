#include "ParseUtilsGameKey.h"
#include "GameUtils2.h"

namespace Parser
{
	using namespace rapidjson;

	UnitLink getUnitLinkKey(const Value& elem, const std::string_view key, UnitLink val)
	{
		if (elem.HasMember(key) == true)
		{
			const auto& keyElem = elem[key];
			if (keyElem.IsString() == true)
			{
				return GameUtils::getUnitLink(keyElem.GetStringView(), val);
			}
		}
		return val;
	}
}
